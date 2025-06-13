document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const promptInput = document.getElementById('promptInput');
    const submitButton = document.getElementById('submitPrompt');
    const promptResult = document.getElementById('promptResult');
    const promptHistory = document.getElementById('promptHistory');
    
    // Load history from localStorage
    loadHistory();
    
    // Event listener for submit button
    submitButton.addEventListener('click', async function() {
        const prompt = promptInput.value.trim();
        
        if (!prompt) {
            alert('Please enter a prompt');
            return;
        }
        
        // Basic input validation
        if (prompt.length > 1000) {
            alert('Prompt is too long (maximum 1000 characters)');
            return;
        }
        
        // Show loading state
        promptResult.innerHTML = '<div class="loading">Processing your request...</div>';
        
        try {
            // Generate CSRF token (in a real app, this would be from the server)
            const csrfToken = generateCSRFToken();
            
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
            
            // Display result in chat format
            displayChatMessage(prompt, data.result);
            
            // Save to history
            saveToHistory(prompt, data.result);
            
            // Clear input
            promptInput.value = '';
            
        } catch (error) {
            promptResult.innerHTML = `<div class="error">Error: ${sanitizeOutput(error.message)}</div>`;
        }
    });
    
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
                
                // Display the selected history item in chat format
                promptInput.value = historyItem.prompt;
                displayChatMessage(historyItem.prompt, historyItem.result);
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
    
    // Function to display chat messages in a consolidated format
    function displayChatMessage(userPrompt, agentResponse) {
        // Clear placeholder if present
        if (promptResult.querySelector('.placeholder')) {
            promptResult.innerHTML = '';
        }
        
        // Create a new message group
        const messageGroup = document.createElement('div');
        messageGroup.className = 'message-group';
        
        // Create user message
        const userMessage = document.createElement('div');
        userMessage.className = 'chat-message user-message';
        userMessage.innerHTML = sanitizeOutput(userPrompt);
        
        // Create agent message
        const agentMessage = document.createElement('div');
        agentMessage.className = 'chat-message agent-message';
        agentMessage.innerHTML = sanitizeOutput(agentResponse);
        
        // Create timestamp
        const timestamp = document.createElement('div');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = new Date().toLocaleTimeString();
        
        // Add messages to the group
        messageGroup.appendChild(userMessage);
        messageGroup.appendChild(agentMessage);
        messageGroup.appendChild(timestamp);
        
        // Add the message group to the result box
        promptResult.prepend(messageGroup);
        
        // Check if there are similar context messages to consolidate
        consolidateSimilarMessages();
    }
    
    // Function to consolidate similar context messages
    function consolidateSimilarMessages() {
        const messageGroups = promptResult.querySelectorAll('.message-group');
        
        // Skip if there are less than 2 message groups
        if (messageGroups.length < 2) return;
        
        // Get the latest user message text
        const latestUserMessage = messageGroups[0].querySelector('.user-message').textContent;
        
        // Check for similar messages in previous groups
        for (let i = 1; i < messageGroups.length; i++) {
            const currentUserMessage = messageGroups[i].querySelector('.user-message').textContent;
            
            // If messages are similar (simple check - can be improved)
            if (areSimilarContexts(latestUserMessage, currentUserMessage)) {
                // Add a visual indicator to show they're related
                messageGroups[i].style.opacity = '0.7';
                messageGroups[i].style.borderLeft = '3px solid #0065c3';
                
                // Add a note to the older message
                const relatedNote = document.createElement('div');
                relatedNote.className = 'related-note';
                relatedNote.textContent = 'Related to newer message';
                relatedNote.style.fontSize = '11px';
                relatedNote.style.fontStyle = 'italic';
                relatedNote.style.color = '#0065c3';
                
                messageGroups[i].appendChild(relatedNote);
            }
        }
    }
    
    // Simple function to check if two messages have similar context
    // This can be improved with more sophisticated text comparison
    function areSimilarContexts(text1, text2) {
        // Convert to lowercase for comparison
        const t1 = text1.toLowerCase();
        const t2 = text2.toLowerCase();
        
        // Check for significant word overlap
        const words1 = t1.split(/\\s+/).filter(w => w.length > 3);
        const words2 = t2.split(/\\s+/).filter(w => w.length > 3);
        
        let matchCount = 0;
        for (const word of words1) {
            if (words2.includes(word)) {
                matchCount++;
            }
        }
        
        // If more than 30% of significant words match, consider them similar
        return matchCount > 0 && (matchCount / Math.max(words1.length, words2.length)) > 0.3;
    }
});