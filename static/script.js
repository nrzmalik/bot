// ==========================================
// STATE MANAGEMENT
// ==========================================
let threadId = null;
let isProcessing = false;

// ==========================================
// DOM ELEMENTS
// ==========================================
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const typingIndicator = document.getElementById('typingIndicator');

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    applyConfig();
    initializeChat();
    setupEventListeners();
});

// ==========================================
// APPLY CONFIGURATION
// ==========================================
function applyConfig() {
    // Apply CSS variables from config
    applyConfigStyles();
    
    // Update text content
    const { content, icons } = CHATBOT_CONFIG;
    
    // Update header
    document.querySelector('.chat-title').textContent = content.botName;
    document.querySelector('.chat-subtitle').textContent = content.botSubtitle;
    document.querySelector('#newChatBtn').innerHTML = icons.newChatIcon + '<span>' + content.newChatButtonText + '</span>';
    
    // Update header avatar
    document.querySelector('.bot-avatar').innerHTML = icons.botAvatar;
    
    // Update welcome message
    document.querySelector('.welcome-title').textContent = content.welcomeTitle;
    document.querySelector('.welcome-text').textContent = content.welcomeMessage;
    document.querySelector('.welcome-icon').innerHTML = icons.welcomeIcon;
    
    // Update input placeholder
    messageInput.placeholder = content.inputPlaceholder;
    
    // Update send button icon
    sendBtn.innerHTML = icons.sendIcon;
}

async function initializeChat() {
    try {
        const response = await fetch('/api/create-thread', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            threadId = data.thread_id;
            console.log('Thread created:', threadId);
        } else {
            showError(CHATBOT_CONFIG.content.initErrorMessage);
        }
    } catch (error) {
        console.error('Error creating thread:', error);
        showError(CHATBOT_CONFIG.content.connectionErrorMessage);
    }
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    // Send message on button click
    sendBtn.addEventListener('click', handleSendMessage);
    
    // Send message on Enter key (Shift+Enter for new line)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
    
    // Auto-resize textarea
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
        
        // Enable/disable send button based on input
        sendBtn.disabled = messageInput.value.trim() === '';
    });
    
    // New chat button
    newChatBtn.addEventListener('click', handleNewChat);
}

// ==========================================
// MESSAGE HANDLING
// ==========================================
async function handleSendMessage() {
    const message = messageInput.value.trim();
    
    if (!message || isProcessing || !threadId) {
        return;
    }
    
    isProcessing = true;
    sendBtn.disabled = true;
    
    // Clear welcome message if exists
    const welcomeMessage = document.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }
    
    // Add user message to UI
    addMessage(message, 'user');
    
    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    try {
        // Create a placeholder for the streaming response (with blinking cursor)
        const assistantMessageDiv = createStreamingMessage();
        let fullResponse = '';
        
        const response = await fetch('/api/send-message-stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                thread_id: threadId,
                message: message
            })
        });
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        
                        if (data.chunk) {
                            // Append chunk to response
                            fullResponse += data.chunk;
                            updateStreamingMessage(assistantMessageDiv, fullResponse);
                        } else if (data.done) {
                            // Streaming complete
                            console.log('Streaming complete');
                        } else if (data.error) {
                            showError('Error: ' + data.error);
                        }
                    } catch (e) {
                        // Ignore parse errors for incomplete chunks
                    }
                }
            }
        }
        
        // Finalize the message
        if (fullResponse) {
            finalizeStreamingMessage(assistantMessageDiv, fullResponse);
        }
        
    } catch (error) {
        console.error('Error sending message:', error);
        showError('Failed to send message. Please try again.');
    } finally {
        isProcessing = false;
        sendBtn.disabled = messageInput.value.trim() === '';
    }
}

// ==========================================
// UI FUNCTIONS
// ==========================================
function addMessage(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;
    
    // Check if avatar should be shown based on config
    const showAvatar = type === 'user' 
        ? CHATBOT_CONFIG.ui.showUserAvatar 
        : CHATBOT_CONFIG.ui.showAssistantAvatar;
    
    if (showAvatar) {
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        
        // Use icons from config
        if (type === 'user') {
            avatar.innerHTML = CHATBOT_CONFIG.icons.userAvatar;
        } else {
            avatar.innerHTML = CHATBOT_CONFIG.icons.assistantAvatar;
        }
        
        messageDiv.appendChild(avatar);
    } else {
        // Add class to indicate no avatar
        messageDiv.classList.add('no-avatar');
    }
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = formatMessage(text);
    
    messageDiv.appendChild(content);
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

// ==========================================
// STREAMING MESSAGE FUNCTIONS
// ==========================================
function createStreamingMessage() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant-message';
    
    // Check if avatar should be shown
    if (CHATBOT_CONFIG.ui.showAssistantAvatar) {
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = CHATBOT_CONFIG.icons.assistantAvatar;
        messageDiv.appendChild(avatar);
    } else {
        messageDiv.classList.add('no-avatar');
    }
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = '<span class="cursor-blink">▋</span>';
    
    messageDiv.appendChild(content);
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    
    return messageDiv;
}

function updateStreamingMessage(messageDiv, text) {
    const content = messageDiv.querySelector('.message-content');
    content.innerHTML = text + '<span class="cursor-blink">▋</span>';
    scrollToBottom();
}

function finalizeStreamingMessage(messageDiv, text) {
    const content = messageDiv.querySelector('.message-content');
    content.innerHTML = formatMessage(text);
    scrollToBottom();
}

// Format message text with basic markdown-like formatting
function formatMessage(text) {
    // Escape HTML to prevent XSS
    let formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Convert markdown formatting
    // Bold: **text** or __text__
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Italic: *text* or _text_
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Code: `code`
    formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Headers: ### Header
    formatted = formatted.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    formatted = formatted.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    formatted = formatted.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    
    // Lists: numbered and bullet points
    // Numbered lists: 1. Item
    formatted = formatted.replace(/^\d+\.\s+(.*?)$/gm, '<li class="numbered-item">$1</li>');
    
    // Bullet points: - Item or * Item
    formatted = formatted.replace(/^[-*]\s+(.*?)$/gm, '<li class="bullet-item">$1</li>');
    
    // Wrap consecutive list items
    formatted = formatted.replace(/(<li class="numbered-item">.*?<\/li>\s*)+/g, '<ol>$&</ol>');
    formatted = formatted.replace(/(<li class="bullet-item">.*?<\/li>\s*)+/g, '<ul>$&</ul>');
    
    // Line breaks: double newline = paragraph, single newline = br
    formatted = formatted.replace(/\n\n+/g, '</p><p>');
    formatted = formatted.replace(/\n/g, '<br>');
    formatted = '<p>' + formatted + '</p>';
    
    // Clean up empty paragraphs
    formatted = formatted.replace(/<p><\/p>/g, '');
    formatted = formatted.replace(/<p>\s*<\/p>/g, '');
    
    return formatted;
}

function showTypingIndicator() {
    typingIndicator.classList.remove('hidden');
    scrollToBottom();
}

function hideTypingIndicator() {
    typingIndicator.classList.add('hidden');
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showError(message) {
    // Create temporary error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message assistant-message';
    errorDiv.innerHTML = `
        <div class="message-avatar">
            ${CHATBOT_CONFIG.icons.errorIcon}
        </div>
        <div class="message-content" style="background-color: var(--error-color); color: white; border: none;">
            ${message}
        </div>
    `;
    
    messagesContainer.appendChild(errorDiv);
    scrollToBottom();
}

// ==========================================
// NEW CHAT HANDLING
// ==========================================
async function handleNewChat() {
    if (isProcessing) {
        return;
    }
    
    const { content, icons } = CHATBOT_CONFIG;
    
    // Clear messages
    messagesContainer.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">
                ${icons.welcomeIcon}
            </div>
            <h2 class="welcome-title">${content.welcomeTitle}</h2>
            <p class="welcome-text">${content.welcomeMessage}</p>
        </div>
    `;
    
    // Create new thread
    await initializeChat();
    
    // Reset input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;
}

