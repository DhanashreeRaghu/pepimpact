const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { BedrockAgentRuntimeClient, InvokeAgentCommand } = require('@aws-sdk/client-bedrock-agent-runtime');

// Load environment variables
dotenv.config();

// Initialize AWS Bedrock Agent client
const bedrockAgentClient = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  }
});

// Store history and sessions in memory (in production, use a database)
let sessionHistory = [];
let userSessions = {};

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(xss());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'https://yourdomain.com' : 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});
app.use('/api/', limiter);

// Middleware
app.use(bodyParser.json({ limit: '10kb' }));
app.use(cookieParser());
// Determine the static file path based on environment
const staticPath = process.env.NODE_ENV === 'production' ? '/app' : path.join(__dirname);

app.use(express.static(staticPath, {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// API endpoint for planner agent
app.post('/api/planner', async (req, res) => {
  try {
    const { prompt, history, debug, userId } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Valid prompt is required' });
    }
    
    // Validate input
    if (prompt.length > 1000) {
      return res.status(400).json({ error: 'Prompt exceeds maximum length' });
    }
    
    // Generate a user ID if not provided
    const userIdentifier = userId || req.ip || 'anonymous';
    
    // Call AWS Bedrock Agent with user context
    const { result, rawResponse } = await invokeBedRockAgent(prompt, history, userIdentifier);
    
    // Update session history with sanitized data
    const sanitizedPrompt = prompt.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sessionHistory.unshift({ 
      prompt: sanitizedPrompt, 
      result, 
      timestamp: new Date().toISOString(),
      userId: userIdentifier
    });
    
    // Keep history manageable
    if (sessionHistory.length > 50) {
      sessionHistory = sessionHistory.slice(0, 50);
    }
    
    // Return raw response if debug mode is enabled
    if (debug) {
      return res.json({ result, rawResponse });
    }
    
    res.json({ 
      result,
      sessionId: userSessions[userIdentifier] || null
    });
    
  } catch (error) {
    console.error('Error processing prompt:', error);
    res.status(500).json({ error: 'Failed to process prompt' });
  }
});

// API endpoint to get history
app.get('/api/history', (req, res) => {
  res.json(sessionHistory);
});

// API endpoint to test Bedrock Agent response
app.post('/api/test-bedrock', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Valid prompt is required' });
    }
    
    // Call AWS Bedrock Agent with debug flag
    const { result, rawResponse } = await invokeBedRockAgent(prompt);
    
    // Return both the processed result and raw response for inspection
    res.json({
      result,
      rawResponse,
      responseStructure: {
        hasCompletion: !!rawResponse?.completion,
        hasOutputText: !!(rawResponse?.output?.text),
        hasText: !!rawResponse?.text,
        keys: rawResponse ? Object.keys(rawResponse) : []
      }
    });
    
  } catch (error) {
    console.error('Error testing Bedrock Agent:', error);
    res.status(500).json({ error: 'Failed to test Bedrock Agent' });
  }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  const htmlPath = process.env.NODE_ENV === 'production' ? '/app/index.html' : path.join(__dirname, 'index.html');
  res.sendFile(htmlPath);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!'
  });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`PEPImpact server running on port ${PORT}`);
});

// Function to invoke AWS Bedrock Agent
async function invokeBedRockAgent(prompt, history, userId = null) {
  try {
    // Get Bedrock Agent ID and Alias ID from environment variables
    const agentId = process.env.BEDROCK_AGENT_ID;
    const agentAliasId = process.env.BEDROCK_AGENT_ALIAS_ID;
    
    // Check if AWS credentials and Bedrock Agent IDs are configured
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || 
        !process.env.BEDROCK_AGENT_ID || !process.env.BEDROCK_AGENT_ALIAS_ID) {
      console.log("Using fallback response (AWS credentials or Bedrock Agent IDs not configured)");
      return { result: fallbackResponse(prompt), rawResponse: null };
    }

    console.log("Preparing Bedrock Agent request");
    
    // Get or create a session ID for this user
    let sessionId;
    if (userId && userSessions[userId]) {
      // Use existing session ID for this user
      sessionId = userSessions[userId];
      console.log(`Using existing session ID ${sessionId} for user ${userId}`);
    } else {
      // Create a new session ID
      sessionId = Date.now().toString();
      if (userId) {
        userSessions[userId] = sessionId;
        console.log(`Created new session ID ${sessionId} for user ${userId}`);
      }
    }
    
    // Enhance the prompt for confirmations
    let enhancedPrompt = prompt;
    if (isConfirmation(prompt) && history && history.length > 0) {
      // Get the most recent exchange
      const lastExchange = history[0];
      
      // Don't try to extract actions, just continue the conversation
      enhancedPrompt = `${prompt}. I'd like to continue our conversation.`;
      console.log(`Enhanced confirmation prompt: "${enhancedPrompt}"`);
    } else {
      enhancedPrompt = analyzePromptContext(prompt, history);
    }
    
    // Prepare the input for the Bedrock Agent
    const input = {
      agentId: agentId,
      agentAliasId: agentAliasId,
      sessionId: sessionId,
      inputText: enhancedPrompt
    };
    
    // Create the command
    const command = new InvokeAgentCommand(input);
    
    console.log("Invoking Bedrock Agent");
    
    // Invoke the Bedrock Agent
    const response = await bedrockAgentClient.send(command);
    console.log("Response received from Bedrock Agent");
    
    // Store a simplified raw response for debugging
    const rawResponse = {
      contentType: response.contentType,
      sessionId: response.sessionId,
      hasCompletion: !!response.completion,
      metadata: response.$metadata
    };
    
    let result;
    // Extract the response based on its structure
    if (response && response.completion) {
      console.log("Found response.completion");
      // Handle streaming response (SmithyMessageDecoderStream)
      if (typeof response.completion === 'object' && typeof response.completion[Symbol.asyncIterator] === 'function') {
        try {
          let resultText = '';
          for await (const chunk of response.completion) {
            if (chunk && chunk.chunk && chunk.chunk.bytes) {
              resultText += new TextDecoder().decode(chunk.chunk.bytes);
            } else if (chunk && chunk.chunk) {
              resultText += chunk.chunk.toString();
            }
          }
          result = resultText || '[No content returned from stream]';
        } catch (streamError) {
          console.error("Error processing stream:", streamError);
          result = '[Error processing stream response]';
        }
      } else {
        result = response.completion;
      }
    } else if (response && response.output && response.output.text) {
      console.log("Found response.output.text");
      result = response.output.text;
    } else if (response && response.text) {
      console.log("Found response.text");
      result = response.text;
    } else {
      console.log("Unexpected response format:", JSON.stringify(response, null, 2));
      throw new Error('No recognizable completion in response');
    }
    
    return { result, rawResponse };
  } catch (error) {
    console.error('Error invoking Bedrock Agent:', error);
    console.log("Using fallback response due to error");
    return { 
      result: fallbackResponse(prompt), 
      rawResponse: error.message ? { error: error.message } : null 
    };
  }
}

// Function to extract suggested actions from a response
function extractSuggestedActions(response) {
  if (!response) return [];
  
  const actionVerbs = ['create', 'delete', 'update', 'modify', 'configure', 'deploy', 
                       'install', 'setup', 'remove', 'add', 'launch', 'start', 'stop',
                       'terminate', 'restart', 'execute', 'run', 'implement'];
  
  const suggestedActions = [];
  const lowercaseResponse = response.toLowerCase();
  
  // Look for phrases like "would you like me to create" or "should I deploy"
  const actionPhrases = [
    /would you like me to (.*?)[\?\.\s]/i,
    /should i (.*?)[\?\.\s]/i,
    /do you want me to (.*?)[\?\.\s]/i,
    /shall i (.*?)[\?\.\s]/i,
    /i can (.*?) for you/i,
    /i recommend (.*?)[\?\.\s]/i
  ];
  
  for (const pattern of actionPhrases) {
    const match = lowercaseResponse.match(pattern);
    if (match && match[1]) {
      const phrase = match[1].trim();
      // Check if the phrase contains an action verb
      for (const verb of actionVerbs) {
        if (phrase.includes(verb)) {
          suggestedActions.push(phrase);
          break;
        }
      }
    }
  }
  
  // If no specific phrases found, look for action verbs directly
  if (suggestedActions.length === 0) {
    for (const verb of actionVerbs) {
      if (lowercaseResponse.includes(verb)) {
        // Get the context around the verb (10 characters before and 30 after)
        const index = lowercaseResponse.indexOf(verb);
        const start = Math.max(0, index - 10);
        const end = Math.min(lowercaseResponse.length, index + verb.length + 30);
        const context = lowercaseResponse.substring(start, end).trim();
        suggestedActions.push(context);
      }
    }
  }
  
  // Always return at least a default action if nothing specific was found
  if (suggestedActions.length === 0) {
    suggestedActions.push("continue our conversation");
  }
  
  return suggestedActions;
}

// Function to analyze prompt context and enhance it with contextual information
function analyzePromptContext(prompt, history) {
  // If no history or prompt is a greeting, return the original prompt
  if (!history || history.length === 0 || isGreeting(prompt)) {
    return prompt;
  }
  
  // Check if the prompt is a confirmation or affirmation
  if (isConfirmation(prompt)) {
    // Look for action verbs in the previous exchanges
    const recentHistory = history.slice(0, 3); // Look at the 3 most recent exchanges
    const actionVerbs = extractActionVerbs(recentHistory);
    
    if (actionVerbs.length > 0) {
      // Enhance the prompt with the action context
      return `${prompt} Please proceed with the ${actionVerbs[0]} operation we discussed.`;
    }
  }
  
  // Check if the prompt is a follow-up question
  if (isFollowUp(prompt)) {
    // Add context from the previous exchange
    if (history.length > 0) {
      const previousContext = history[0].result || '';
      return `${prompt} (Regarding our previous discussion: ${truncateText(previousContext, 100)})`;
    }
  }
  
  return prompt;
}

// Helper function to check if a prompt is a greeting
function isGreeting(prompt) {
  const greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'];
  const lowercasePrompt = prompt.toLowerCase();
  return greetings.some(greeting => lowercasePrompt.includes(greeting)) && prompt.length < 20;
}

// Helper function to check if a prompt is a confirmation or affirmation
function isConfirmation(prompt) {
  const confirmations = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'proceed', 'confirm', 'do it', 'go ahead', 'sounds good'];
  const lowercasePrompt = prompt.toLowerCase().trim();
  return confirmations.some(confirmation => 
    lowercasePrompt === confirmation || 
    lowercasePrompt.startsWith(confirmation + ' ') || 
    lowercasePrompt.endsWith(' ' + confirmation)
  );
}

// Helper function to check if a prompt is a follow-up question
function isFollowUp(prompt) {
  const followUps = ['what about', 'and then', 'next', 'after that', 'continue', 'more', 'tell me more', 'elaborate'];
  const lowercasePrompt = prompt.toLowerCase();
  return followUps.some(followUp => lowercasePrompt.includes(followUp)) || 
         prompt.length < 15 || // Short questions are often follow-ups
         !prompt.includes(' '); // Single word prompts are often follow-ups
}

// Helper function to extract action verbs from history
function extractActionVerbs(history) {
  const actionVerbs = ['create', 'delete', 'update', 'modify', 'configure', 'deploy', 'install', 'setup', 'remove', 'add'];
  const results = [];
  
  // Look through the history for action verbs
  for (const item of history) {
    const combinedText = (item.prompt + ' ' + item.result).toLowerCase();
    for (const verb of actionVerbs) {
      if (combinedText.includes(verb)) {
        results.push(verb);
      }
    }
  }
  
  return [...new Set(results)]; // Remove duplicates
}

// Helper function to truncate text
function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Fallback response when Bedrock Agent is unavailable
function fallbackResponse(prompt) {
  if (prompt.toLowerCase().includes('plan')) {
    return `Here's a plan based on your request:\n\n1. Analyze requirements\n2. Design solution\n3. Implement core functionality\n4. Test and validate\n5. Deploy to production`;
  } else if (prompt.toLowerCase().includes('help')) {
    return `I can help you plan and organize tasks. Try asking me to create a plan for a specific project or goal.`;
  } else {
    return `I received your prompt: "${prompt}"\n\nThis is a fallback response as the Bedrock Agent is currently unavailable. Please check your configuration or try again later.`;
  }
}