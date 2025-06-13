document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const promptInput = document.getElementById('promptInput');
    const submitButton = document.getElementById('submitPrompt');
    const promptResult = document.getElementById('promptResult');
    const promptHistory = document.getElementById('promptHistory');
    
    // Store user session ID
    let userSessionId = localStorage.getItem('userSessionId') || generateUserId();
    
    // Save the user ID to localStorage
    localStorage.setItem('userSessionId', userSessionId);
    
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
    
    // Setup drag and drop for textarea
    setupDragAndDrop();
    
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
            
            // Add loading message element
            const loadingElement = document.createElement('div');
            loadingElement.className = 'message bot-message loading';
            loadingElement.innerHTML = 'Processing your request...';
            promptResult.appendChild(loadingElement);
            promptResult.scrollTop = promptResult.scrollHeight;
            
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
                    history: getHistory(),
                    userId: userSessionId
                })
            });
            
            // Remove loading message
            promptResult.removeChild(loadingElement);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to get response from server');
            }
            
            const data = await response.json();
            
            // Format and shorten the response before displaying
            const formattedResult = formatBedrockResponse(data.result);
            addMessageToConversation(formattedResult, 'bot');
            
            // Save to history
            saveToHistory(prompt, data.result);
            
        } catch (error) {
            addMessageToConversation(`Error: ${error.message}`, 'bot error');
        }
    }
    
    // Setup drag and drop functionality
    function setupDragAndDrop() {
        // Add drag and drop events to textarea
        promptInput.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('drag-over');
        });
        
        promptInput.addEventListener('dragleave', function() {
            this.classList.remove('drag-over');
        });
        
        promptInput.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
            
            // Get the text data from the drag event
            const text = e.dataTransfer.getData('text/plain');
            if (text) {
                // Insert the text at the cursor position or append to existing text
                if (this.selectionStart || this.selectionStart === 0) {
                    const startPos = this.selectionStart;
                    const endPos = this.selectionEnd;
                    this.value = this.value.substring(0, startPos) + text + this.value.substring(endPos);
                    this.selectionStart = this.selectionEnd = startPos + text.length;
                } else {
                    this.value += text;
                }
                this.focus();
            }
        });
    }
    
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
        
        // For bot messages, use innerHTML to render formatted content
        // For user messages, use sanitized text
        if (type === 'bot') {
            messageElement.innerHTML = message; // Already formatted and sanitized
        } else {
            messageElement.innerHTML = sanitizeOutput(message);
        }
        
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
            promptHistory.innerHTML = '<p class="placeholder">Your history will appear here... 📚</p>';
            return;
        }
        
        let historyHTML = '';
        
        history.forEach((item, index) => {
            historyHTML += `
                <div class="history-item" data-index="${index}" draggable="true">
                    <div class="prompt">${truncateText(sanitizeOutput(item.prompt), 50)}</div>
                    <div class="timestamp">${formatDate(item.timestamp)}</div>
                </div>
            `;
        });
        
        promptHistory.innerHTML = historyHTML;
        
        // Add events to history items
        document.querySelectorAll('.history-item').forEach(item => {
            // Click event
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
            });
            
            // Drag start event
            item.addEventListener('dragstart', function(e) {
                const index = this.getAttribute('data-index');
                const historyItem = getHistory()[index];
                e.dataTransfer.setData('text/plain', historyItem.prompt);
                e.dataTransfer.effectAllowed = 'copy';
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
    
    // Generate a unique user ID
    function generateUserId() {
        return 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
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
    
    // Format and shorten Bedrock responses
    function formatBedrockResponse(response) {
        if (!response) return '';
        
        // Remove excessive newlines (replace 3+ newlines with 2)
        let formatted = response.replace(/\n{3,}/g, '\n\n');
        
        // Format numbered lists for better readability
        formatted = formatted.replace(/(\d+\.\s+)(.*?)(?=\n\d+\.|$)/gs, '<li>$2</li>');
        formatted = formatted.replace(/(<li>.*?<\/li>)+/gs, '<ol class="response-list">$&</ol>');
        
        // Format bullet point lists
        formatted = formatted.replace(/(-\s+)(.*?)(?=\n-\s+|$)/gs, '<li>$2</li>');
        formatted = formatted.replace(/(\*\s+)(.*?)(?=\n\*\s+|$)/gs, '<li>$2</li>');
        formatted = formatted.replace(/(<li>.*?<\/li>)+/gs, '<ul class="response-list">$&</ul>');
        
        // Format code blocks
        formatted = formatted.replace(/```([^`]+)```/g, '<pre class="code-block">$1</pre>');
        
        // Format headings
        formatted = formatted.replace(/^(#+)\s+(.*?)$/gm, (match, hashes, text) => {
            const level = Math.min(hashes.length + 3, 6); // h4, h5, h6
            return `<h${level}>${text}</h${level}>`;
        });
        
        // Format bold text
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Format italic text
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Convert URLs to links
        formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
        
        // Format tables if present
        formatted = formatted.replace(/\|(.+)\|/g, '<tr><td>$1</td></tr>').replace(/<tr><td>(.+?)<\/td><\/tr>/g, function(match, content) {
            return '<tr><td>' + content.replace(/\|/g, '</td><td>') + '</td></tr>';
        });
        formatted = formatted.replace(/(<tr>.+?<\/tr>)+/g, '<table class="response-table">$&</table>');
        
        // Preserve paragraph breaks
        formatted = '<p>' + formatted.replace(/\n\n/g, '</p><p>') + '</p>';
        
        // Clean up any empty paragraphs
        formatted = formatted.replace(/<p>\s*<\/p>/g, '');
        
        return formatted;
    }
});