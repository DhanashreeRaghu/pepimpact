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