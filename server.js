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
    sessionToken: process.env.AWS_SESSION_TOKEN // Include session token if using temporary credentials
  }
});

const app = express();
app.set('trust proxy', 1); // <-- Add this line
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet()); // Set security HTTP headers
app.use(xss()); // Sanitize input
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
app.use(bodyParser.json({ limit: '10kb' })); // Body limit is 10kb
app.use(cookieParser()); // Parse cookies
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Store history in memory (in production, use a database)
let sessionHistory = [];

// API endpoint for planner agent
app.post('/api/planner', async (req, res) => {
  try {
    const { prompt, history } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Valid prompt is required' });
    }
    
    // Validate input
    if (prompt.length > 1000) {
      return res.status(400).json({ error: 'Prompt exceeds maximum length' });
    }
    
    // Call AWS Bedrock Agent
    const result = await invokeBedRockAgent(prompt, history);
    
    // Update session history with sanitized data
    const sanitizedPrompt = prompt.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sessionHistory.unshift({ 
      prompt: sanitizedPrompt, 
      result, 
      timestamp: new Date().toISOString() 
    });
    
    // Keep history manageable
    if (sessionHistory.length > 50) {
      sessionHistory = sessionHistory.slice(0, 50);
    }
    
    res.json({ result });
    
  } catch (error) {
    console.error('Error processing prompt:', error);
    res.status(500).json({ error: 'Failed to process prompt' });
  }
});

// API endpoint to get history
app.get('/api/history', (req, res) => {
  res.json(sessionHistory);
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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
app.listen(PORT, () => {
  console.log(`PEPImpact server running on http://localhost:${PORT}`);
});

// Function to invoke AWS Bedrock Agent
async function invokeBedRockAgent(prompt, history) {
  try {
    // Check if AWS credentials and Bedrock Agent IDs are configured
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || 
        !process.env.BEDROCK_AGENT_ID || !process.env.BEDROCK_AGENT_ALIAS_ID) {
      console.log("Using fallback response (AWS credentials or Bedrock Agent IDs not configured)");
      return fallbackResponse(prompt);
    }
    
    // Hardcoded Bedrock Agent ID and Alias ID
    const agentId = "WYHH6PBYJQ";
    const agentAliasId = "SYZPYK4YHY";
    
    console.log("Preparing Bedrock Agent request");
    
    // Prepare the input for the Bedrock Agent
    const input = {
      agentId: agentId,
      agentAliasId: agentAliasId,
      sessionId: Date.now().toString(), // Generate a unique session ID
      inputText: prompt
    };
    
    // Create the command
    const command = new InvokeAgentCommand(input);
    
    console.log("Invoking Bedrock Agent");
    
    // Invoke the Bedrock Agent
    const response = await bedrockAgentClient.send(command);
    
    console.log("Response received from Bedrock Agent");
    
    // Extract and return the response
    if (response.completion) {
      return response.completion;
    } else {
      throw new Error('No completion in response');
    }
  } catch (error) {
    console.error('Error invoking Bedrock Agent:', error);
    return fallbackResponse(prompt);
  }
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
