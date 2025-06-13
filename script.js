document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const promptInput = document.getElementById('promptInput');
    const submitButton = document.getElementById('submitPrompt');
    const promptResult = document.getElementById('promptResult');
    const promptHistory = document.getElementById('promptHistory');
    const confirmationArea = document.getElementById('confirmationArea');
    const confirmButton = document.getElementById('confirmAction');
    const cancelButton = document.getElementById('cancelAction');
    
    // Store the current prompt and response for confirmation
    let currentPrompt = '';
    let pendingAction = null;
    
    // Load history from localStorage
    loadHistory();
    
    // Event listener for submit button
    submitButton.addEventListener('click', handleSubmit);
    
    // Event listener for Enter key in textarea
    promptInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });
    
    // Handle form submission
    async function handleSubmit() {
        const prompt = promptInput.value.trim();
        
        if (!prompt) {
            return;
        }
        
        // Basic input validation
        if (prompt.length > 1000) {
            alert('Message is too long (maximum 1000 characters)');
            return;
        }
        
        // Add user message to the conversation
        addMessageToConversation(prompt, 'user');
        
        // Clear input
        promptInput.value = '';
        
        try {
            // Generate CSRF token (in a real app, this would be from the server)
            const csrfToken = generateCSRFToken();
            
            // Store the current prompt for confirmation
            currentPrompt = prompt;
            
            // First, get a preliminary response to analyze
            const prelimResponse = await fetch('/api/planner', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                credentials: 'same-origin',
                body: JSON.stringify({ 
                    prompt: sanitizeInput(prompt), 
                    history: getHistory() 
                })
            });
            
            if (!prelimResponse.ok) {
                const errorData = await prelimResponse.json();
                throw new Error(errorData.error || 'Failed to get response from server');
            }
            
            const prelimData = await prelimResponse.json();
            const responseText = prelimData.result;
            
            // Check if the response suggests an action that requires confirmation
            if (responseRequiresConfirmation(responseText)) {
                // Extract the action from the response
                const action = extractActionFromResponse(responseText);
                
                // Show the response but ask for confirmation before proceeding
                addMessageToConversation(responseText, 'bot');
                addMessageToConversation(`Do you want to ${action}?`, 'bot confirmation');
                confirmationArea.style.display = 'block';
                
                // Set up the pending action - in this case, we're confirming the response
                pendingAction = async () => {
                    // The user confirmed, so we'll send a follow-up message
                    await sendPromptToBedrock(`Yes, please ${action}`, csrfToken);
                };
                
                // Save to history
                saveToHistory(prompt, responseText);
                
                return;
            }
            
            // If no confirmation needed, just display the response
            addMessageToConversation(prelimData.result, 'bot');
            
            // Save to history
            saveToHistory(prompt, prelimData.result);
            
        } catch (error) {
            addMessageToConversation(`Error: ${error.message}`, 'bot error');
            confirmationArea.style.display = 'none';
        }
    }
    
    // Event listener for confirm button
    confirmButton.addEventListener('click', async function() {
        if (pendingAction) {
            confirmationArea.style.display = 'none';
            
            try {
                await pendingAction();
                pendingAction = null;
            } catch (error) {
                addMessageToConversation(`Error: ${error.message}`, 'bot error');
            }
        }
    });
    
    // Event listener for cancel button
    cancelButton.addEventListener('click', function() {
        confirmationArea.style.display = 'none';
        addMessageToConversation('Action cancelled.', 'bot');
        pendingAction = null;
    });
    
    // Function to add a message to the conversation
    function addMessageToConversation(message, type) {
        // Remove placeholder if present
        const placeholder = promptResult.querySelector('.placeholder');
        if (placeholder) {
            promptResult.removeChild(placeholder);
        }
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}-message`;
        
        // Add message content
        messageElement.innerHTML = sanitizeOutput(message);
        
        // Add timestamp
        const timeElement = document.createElement('div');
        timeElement.className = 'message-time';
        timeElement.textContent = new Date().toLocaleTimeString();
        messageElement.appendChild(timeElement);
        
        // Add to conversation
        promptResult.appendChild(messageElement);
        
        // Scroll to bottom
        promptResult.scrollTop = promptResult.scrollHeight;
    }
    
    // Function to send prompt to Bedrock
    async function sendPromptToBedrock(prompt, csrfToken) {
        // Add loading message element
        const loadingElement = document.createElement('div');
        loadingElement.className = 'message bot-message loading';
        loadingElement.innerHTML = 'Processing your request...';
        promptResult.appendChild(loadingElement);
        promptResult.scrollTop = promptResult.scrollHeight;
        
        try {
            // Send prompt to backend API
            const response = await fetch('/api/planner', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                credentials: 'same-origin', // Include cookies
                body: JSON.stringify({ 
                    prompt: sanitizeInput(prompt), 
                    history: getHistory() 
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to get response from server');
            }
            
            const data = await response.json();
            
            // Remove loading message
            promptResult.removeChild(loadingElement);
            
            // Display result
            addMessageToConversation(data.result, 'bot');
            confirmationArea.style.display = 'none';
            
            // Save to history
            saveToHistory(prompt, data.result);
        } catch (error) {
            // Remove loading message
            promptResult.removeChild(loadingElement);
            throw error;
        }
    }
    
    // Function to check if a response requires confirmation
    function responseRequiresConfirmation(response) {
        const lowercaseResponse = response.toLowerCase();
        
        // Phrases that suggest the response is asking for confirmation
        const confirmationPhrases = [
            'would you like me to', 'should i', 'do you want me to',
            'shall i', 'would you like to', 'do you want to proceed',
            'would you like to proceed', 'should we proceed',
            'would you like to continue', 'do you want to continue',
            'please confirm', 'please let me know if you want to proceed',
            'i can help you with that', 'i can do that for you',
            'would you like to execute', 'should i execute',
            'would you like to implement', 'should i implement'
        ];
        
        return confirmationPhrases.some(phrase => lowercaseResponse.includes(phrase));
    }
    
    // Function to extract the action from the response
    function extractActionFromResponse(response) {
        const lowercaseResponse = response.toLowerCase();
        
        // Look for common action patterns in the response
        const actionPatterns = [
            { pattern: /would you like me to (.*?)[?\.]/i, group: 1 },
            { pattern: /should i (.*?)[?\.]/i, group: 1 },
            { pattern: /do you want me to (.*?)[?\.]/i, group: 1 },
            { pattern: /shall i (.*?)[?\.]/i, group: 1 },
            { pattern: /would you like to (.*?)[?\.]/i, group: 1 },
            { pattern: /i can (.*?) for you/i, group: 1 },
            { pattern: /i can help you (.*?)[?\.]/i, group: 1 }
        ];
        
        // Try to extract the action using patterns
        for (const { pattern, group } of actionPatterns) {
            const match = response.match(pattern);
            if (match && match[group]) {
                return match[group].trim();
            }
        }
        
        // If no specific pattern matches, look for key sentences
        const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
        for (const sentence of sentences) {
            if (sentence.toLowerCase().includes('next step') || 
                sentence.toLowerCase().includes('can proceed') ||
                sentence.toLowerCase().includes('can help')) {
                return 'proceed with this suggestion';
            }
        }
        
        // Default action if no specific action is found
        return 'proceed with the suggested action';
    }
    
    // Function to save prompt and result to history
    function saveToHistory(prompt, result) {
        const timestamp = new Date().toISOString();
        const historyItem = { 
            prompt: sanitizeInput(prompt), 
            result: sanitizeInput(result), 
            timestamp 
        };
        
        // Get existing history or initialize empty array
        const history = getHistory();
        
        // Add new item to the beginning
        history.unshift(historyItem);
        
        // Keep only the last 10 items
        const trimmedHistory = history.slice(0, 10);
        
        // Save to localStorage
        try {
            localStorage.setItem('promptHistory', JSON.stringify(trimmedHistory));
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
        
        // Update history display
        loadHistory();
    }
    
    // Function to get history from localStorage
    function getHistory() {
        try {
            const history = localStorage.getItem('promptHistory');
            return history ? JSON.parse(history) : [];
        } catch (e) {
            console.error('Failed to parse history:', e);
            return [];
        }
    }
    
    // Function to load and display history
    function loadHistory() {
        const history = getHistory();
        
        if (history.length === 0) {
            promptHistory.innerHTML = '<p class="placeholder">Your history will appear here...</p>';
            return;
        }
        
        let historyHTML = '';
        
        history.forEach((item, index) => {
            historyHTML += `
                <div class="history-item" data-index="${index}">
                    <div class="prompt">${truncateText(sanitizeOutput(item.prompt), 50)}</div>
                    <div class="timestamp">${formatDate(item.timestamp)}</div>
                </div>
            `;
        });
        
        promptHistory.innerHTML = historyHTML;
        
        // Add click event to history items
        document.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', function() {
                const index = this.getAttribute('data-index');
                const historyItem = getHistory()[index];
                
                // Clear the conversation
                promptResult.innerHTML = '';
                
                // Display the conversation from history
                addMessageToConversation(historyItem.prompt, 'user');
                addMessageToConversation(historyItem.result, 'bot');
                
                // Set the input value
                promptInput.value = '';
                confirmationArea.style.display = 'none';
            });
        });
    }
    
    // Helper function to truncate text
    function truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
    
    // Helper function to format date
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString();
    }
    
    // Security helper functions
    
    // Basic sanitization function for user input
    function sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    // Sanitize output before displaying
    function sanitizeOutput(input) {
        if (typeof input !== 'string') return '';
        return input
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    
    // Generate a simple CSRF token
    function generateCSRFToken() {
        // In a real app, this would come from the server
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }
});