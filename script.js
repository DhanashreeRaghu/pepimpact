document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const promptInput = document.getElementById('promptInput');
    const submitButton = document.getElementById('submitPrompt');
    const promptResult = document.getElementById('promptResult');
    const promptHistory = document.getElementById('promptHistory');
    
    // Load history from localStorage
    loadHistory();
    
    // Add event listener for Enter key in the input field
    promptInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submitPrompt();
        }
    });
    
    // Event listener for submit button
    submitButton.addEventListener('click', submitPrompt);
    
    // Function to handle prompt submission
    async function submitPrompt() {
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
            
            // Display result (sanitize the output)
            promptResult.innerHTML = `<pre>${sanitizeOutput(data.result)}</pre>`;
            
            // Save to history
            saveToHistory(prompt, data.result);
            
            // Clear input
            promptInput.value = '';
            
        } catch (error) {
            promptResult.innerHTML = `<div class="error">Error: ${sanitizeOutput(error.message)}</div>`;
        }
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
                
                // Display the selected history item
                promptInput.value = historyItem.prompt;
                promptResult.innerHTML = `<pre>${sanitizeOutput(historyItem.result)}</pre>`;
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