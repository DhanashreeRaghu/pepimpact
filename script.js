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
            
            // Check if the prompt requires confirmation
            if (requiresConfirmation(prompt)) {
                // Show the confirmation area
                addMessageToConversation('You\'re about to perform an action that requires confirmation. Please confirm to proceed.', 'bot');
                confirmationArea.style.display = 'block';
                
                // Set up the pending action
                pendingAction = async () => {
                    await sendPromptToBedrock(prompt, csrfToken);
                };
                
                return;
            }
            
            // If no confirmation needed, proceed directly
            await sendPromptToBedrock(prompt, csrfToken);
            
        } catch (error) {
            addMessageToConversation(`Error: ${error.message}`, 'bot error');
            confirmationArea.style.display = 'none';
        }
    }
    
    // Event listener for confirm button
    confirmButton.addEventListener('click', async function() {
        if (pendingAction) {
            confirmationArea.style.display = 'none';
            addMessageToConversation('Processing your request...', 'bot loading');
            
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
        // Add loading message
        const loadingId = Date.now();
        addMessageToConversation('Processing your request...', 'bot loading');
        
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
        const loadingMessages = promptResult.querySelectorAll('.loading');
        if (loadingMessages.length > 0) {
            promptResult.removeChild(loadingMessages[loadingMessages.length - 1].parentNode);
        }
        
        // Display result
        addMessageToConversation(data.result, 'bot');
        confirmationArea.style.display = 'none';
        
        // Save to history
        saveToHistory(prompt, data.result);
    }
    
    // Function to check if a prompt requires confirmation
    function requiresConfirmation(prompt) {
        const lowercasePrompt = prompt.toLowerCase();
        
        // Keywords that might indicate actions requiring confirmation
        const actionKeywords = [
            'delete', 'remove', 'drop', 'terminate', 'stop', 'shutdown',
            'create', 'launch', 'start', 'deploy', 'provision', 'execute',
            'update', 'modify', 'change', 'configure'
        ];
        
        // Check if any action keywords are present
        return actionKeywords.some(keyword => lowercasePrompt.includes(keyword));
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