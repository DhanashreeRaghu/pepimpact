# PEPImpact

A secure web interface for interacting with AWS Bedrock Agent, featuring prompt input, results display, and history tracking.

## Features

- Input area for entering prompts
- Display area for viewing results
- History section on the left side to track past prompts and responses
- Integration with AWS Bedrock Agent using InvokeAgentCommand
- Security features including XSS protection, CSRF protection, and rate limiting

## AWS Bedrock Agent Integration

PEPImpact now integrates with AWS Bedrock Agent to provide intelligent responses to user prompts. The application uses the AWS SDK for JavaScript to communicate with the Bedrock Agent Runtime API.

## Setup

1. Copy `.env.example` to `.env` and configure your environment variables:
   ```
   cp .env.example .env
   ```

2. Update the `.env` file with your AWS Bedrock Agent details:
   ```
   AWS_REGION=your-aws-region
   BEDROCK_AGENT_ID=your-agent-id
   BEDROCK_AGENT_ALIAS_ID=your-agent-alias-id
   ```

3. Install dependencies:
   ```
   npm install
   ```

4. Start the server:
   ```
   npm start
   ```

## Security Features

- **Helmet.js**: Sets various HTTP headers for security
- **XSS Protection**: Input and output sanitization
- **CSRF Protection**: Token-based protection against cross-site request forgery
- **Rate Limiting**: Prevents abuse through API rate limiting
- **Content Security Policy**: Restricts resource loading to prevent XSS attacks
- **CORS**: Configurable cross-origin resource sharing
- **Input Validation**: Server and client-side validation

## Setup

1. Copy `.env.example` to `.env` and configure your environment variables:
   ```
   cp .env.example .env
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the server:
   ```
   npm start
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Development

For development with auto-restart:
```
npm run dev
```

## Integrating with Your Planner Agent

To connect this UI with your actual planner agent:

1. Modify the `simulatePlannerAgent` function in `server.js` to call your actual planner agent API
2. Update the response handling to match your planner agent's output format
3. Configure proper authentication for your planner agent API

## Structure

- `index.html` - Main web interface with CSP headers
- `styles.css` - Styling for the UI
- `script.js` - Frontend JavaScript with security measures
- `server.js` - Backend server with security middleware
- `package.json` - Node.js dependencies
- `.env.example` - Example environment configuration