const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
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
    
    // In a real application, this would call your actual planner agent
    // For now, we'll simulate a response
    const result = await simulatePlannerAgent(prompt, history);
    
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
  console.log(`Server running on http://localhost:${PORT}`);
});

// Function to simulate planner agent response
// In a real application, this would be replaced with actual API calls to your planner agent
async function simulatePlannerAgent(prompt, history) {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Simple response based on prompt
  if (prompt.toLowerCase().includes('plan')) {
    return `Here's a plan based on your request:\n\n1. Analyze requirements\n2. Design solution\n3. Implement core functionality\n4. Test and validate\n5. Deploy to production`;
  } else if (prompt.toLowerCase().includes('help')) {
    return `I can help you plan and organize tasks. Try asking me to create a plan for a specific project or goal.`;
  } else {
    return `I received your prompt: "${prompt}"\n\nThis is a simulated response from the planner agent. In a real implementation, this would connect to your actual backend planner agent.`;
  }
}