 class ChatViewer {
            constructor() {
                this.chatData = [];
                this.allMessages = [];
                this.filteredMessages = [];
                this.participants = new Set();
                this.currentUser = 'geets';
                this.searchMatches = [];
                this.currentMatchIndex = -1;
                this.init();
            }

            init() {
                this.bindEvents();
            }

            bindEvents() {
                const elements = {
                    uploadArea: document.getElementById('uploadArea'),
                    fileInput: document.getElementById('fileInput'),
                    searchIcon: document.getElementById('searchIcon'),
                    searchBar: document.getElementById('searchBar'),
                    searchInput: document.getElementById('searchInput'),
                    prevButton: document.getElementById('prevButton'),
                    nextButton: document.getElementById('nextButton')
                };

                // File upload events
                elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
                elements.uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
                elements.uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
                elements.uploadArea.addEventListener('drop', this.handleDrop.bind(this));
                elements.fileInput.addEventListener('change', this.handleFileSelect.bind(this));

                // Search events
                elements.searchIcon.addEventListener('click', this.toggleSearch.bind(this));
                elements.searchInput.addEventListener('input', this.debounce(this.handleSearch.bind(this), 300));

                // Navigation events
                elements.prevButton.addEventListener('click', this.goToPreviousMatch.bind(this));
                elements.nextButton.addEventListener('click', this.goToNextMatch.bind(this));

                // Keyboard shortcuts
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && document.getElementById('searchBar').classList.contains('flex')) {
                        this.toggleSearch();
                    }
                    if (e.ctrlKey && e.key === 'f') {
                        e.preventDefault();
                        this.toggleSearch();
                    }
                });
            }

            // File handling methods
            handleDragOver(e) {
                e.preventDefault();
                document.getElementById('uploadArea').classList.add('border-ios-blue', 'bg-blue-50');
            }

            handleDragLeave(e) {
                e.preventDefault();
                document.getElementById('uploadArea').classList.remove('border-ios-blue', 'bg-blue-50');
            }

            handleDrop(e) {
                e.preventDefault();
                document.getElementById('uploadArea').classList.remove('border-ios-blue', 'bg-blue-50');
                const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/json');
                this.processFiles(files);
            }

            handleFileSelect(e) {
                this.processFiles(Array.from(e.target.files));
            }

            async processFiles(files) {
                if (!files.length) return;
                
                this.showLoading(true);
                this.hideUploadOverlay();
                this.resetData();

                try {
                    for (const file of files) {
                        const content = await this.readFile(file);
                        const thread = this.parseAndConvertChatData(content, file.name);
                        if (thread) {
                            this.chatData.push(thread);
                            this.extractMessages(thread);
                        }
                    }
                    this.filteredMessages = [...this.allMessages];
                    this.renderMessages();
                    this.updateRecipientName();
                } catch (error) {
                    this.showError('Error processing files: ' + error.message);
                } finally {
                    this.showLoading(false);
                }
            }

            resetData() {
                this.chatData = [];
                this.allMessages = [];
                this.participants.clear();
                this.searchMatches = [];
                this.currentMatchIndex = -1;
            }

            readFile(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = e => resolve(e.target.result);
                    reader.onerror = () => reject(new Error('Failed to read file'));
                    reader.readAsText(file);
                });
            }

            parseAndConvertChatData(jsonString, filename) {
                try {
                    const data = JSON.parse(jsonString);
                    if (data.participants) {
                        data.participants.forEach(p => this.participants.add(p.name));
                    }
                    data.filename = filename;
                    return data;
                } catch (error) {
                    throw new Error(`Invalid JSON in file ${filename}`);
                }
            }

            extractMessages(thread) {
                if (!thread.messages) return;
                
                const messages = thread.messages
                    .filter(msg => msg.content && msg.content.trim())
                    .map(msg => ({
                        ...msg,
                        threadTitle: thread.title,
                        threadFilename: thread.filename
                    }));

                this.allMessages.push(...messages);
                this.allMessages.sort((a, b) => (a.timestamp_ms || 0) - (b.timestamp_ms || 0));
            }

            // Search functionality
            toggleSearch() {
                const searchBar = document.getElementById('searchBar');
                const searchInput = document.getElementById('searchInput');
                const isActive = searchBar.classList.contains('flex');
                
                if (isActive) {
                    searchBar.classList.remove('flex');
                    searchBar.classList.add('hidden');
                    searchInput.value = '';
                    this.clearSearch();
                } else {
                    searchBar.classList.remove('hidden');
                    searchBar.classList.add('flex');
                    searchInput.focus();
                }
            }

            handleSearch() {
                const searchTerm = document.getElementById('searchInput').value.trim();
                const nav = document.getElementById('searchNavigation');

                if (!searchTerm) {
                    this.clearSearch();
                    return;
                }

                this.performSearch(searchTerm, 'both');
                nav.classList.remove('hidden');
                nav.classList.add('flex');
                this.updateSearchNavigation();
            }

            performSearch(searchTerm, searchType) {
                const term = searchTerm.toLowerCase();
                
                this.filteredMessages = this.allMessages.filter(msg => {
                    const content = (msg.content || '').toLowerCase();
                    const sender = (msg.sender_name || '').toLowerCase();
                    const date = this.formatMessageDate(msg);
                    const dateStr = date.toLowerCase();

                    switch (searchType) {
                        case 'text':
                            return content.includes(term) || sender.includes(term);
                        case 'date':
                            return this.matchesDateSearch(term, msg) || dateStr.includes(term);
                        case 'both':
                            return content.includes(term) || sender.includes(term) || 
                                   this.matchesDateSearch(term, msg) || dateStr.includes(term);
                        default:
                            return content.includes(term) || sender.includes(term);
                    }
                });

                this.findSearchMatches(searchTerm, 'both');
            }

            matchesDateSearch(term, message) {
                if (!message.timestamp_ms) return false;
                
                const msgDate = new Date(message.timestamp_ms);
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);

                // Handle special date terms
                if (term === 'today') {
                    return this.isSameDay(msgDate, today);
                }
                if (term === 'yesterday') {
                    return this.isSameDay(msgDate, yesterday);
                }

                // Handle ISO date format (YYYY-MM-DD)
                if (/^\d{4}-\d{2}-\d{2}$/.test(term)) {
                    const searchDate = new Date(term);
                    return this.isSameDay(msgDate, searchDate);
                }

                // Handle partial dates
                const msgDateStr = msgDate.toISOString().slice(0, 10);
                return msgDateStr.includes(term);
            }

            isSameDay(date1, date2) {
                return date1.getFullYear() === date2.getFullYear() &&
                       date1.getMonth() === date2.getMonth() &&
                       date1.getDate() === date2.getDate();
            }

            findSearchMatches(searchTerm, searchType) {
                this.searchMatches = [];
                const term = searchTerm.toLowerCase();

                this.allMessages.forEach((msg, i) => {
                    const content = (msg.content || '').toLowerCase();
                    const sender = (msg.sender_name || '').toLowerCase();
                    let hasMatch = false;

                    switch (searchType) {
                        case 'text':
                            hasMatch = content.includes(term) || sender.includes(term);
                            break;
                        case 'date':
                            hasMatch = this.matchesDateSearch(term, msg);
                            break;
                        case 'both':
                            hasMatch = content.includes(term) || sender.includes(term) || 
                                      this.matchesDateSearch(term, msg);
                            break;
                        default:
                            hasMatch = content.includes(term) || sender.includes(term);
                    }

                    if (hasMatch) {
                        this.searchMatches.push(i);
                    }
                });

                this.currentMatchIndex = this.searchMatches.length ? 0 : -1;
            }

            clearSearch() {
                this.filteredMessages = [...this.allMessages];
                this.searchMatches = [];
                this.currentMatchIndex = -1;
                document.getElementById('searchNavigation').classList.add('hidden');
                document.getElementById('searchNavigation').classList.remove('flex');
                this.renderMessages();
            }

            goToPreviousMatch() {
                if (!this.searchMatches.length) return;
                this.currentMatchIndex = this.currentMatchIndex <= 0 ? 
                    this.searchMatches.length - 1 : this.currentMatchIndex - 1;
                this.updateSearchNavigation();
                this.scrollToCurrentMatch();
            }

            goToNextMatch() {
                if (!this.searchMatches.length) return;
                this.currentMatchIndex = this.currentMatchIndex >= this.searchMatches.length - 1 ? 
                    0 : this.currentMatchIndex + 1;
                this.updateSearchNavigation();
                this.scrollToCurrentMatch();
            }

            updateSearchNavigation() {
                const resultsInfo = document.getElementById('searchResultsInfo');
                const prevButton = document.getElementById('prevButton');
                const nextButton = document.getElementById('nextButton');

                if (!this.searchMatches.length) {
                    resultsInfo.textContent = 'No matches';
                    prevButton.disabled = true;
                    nextButton.disabled = true;
                } else {
                    resultsInfo.textContent = `${this.currentMatchIndex + 1} of ${this.searchMatches.length}`;
                    prevButton.disabled = false;
                    nextButton.disabled = false;
                }
                
                this.renderMessages();
            }

            scrollToCurrentMatch() {
                setTimeout(() => {
                    const element = document.querySelector('.current-match');
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);
            }

            // Rendering methods
            renderMessages() {
                const chatArea = document.getElementById('chatArea');
                
                if (!this.allMessages.length) {
                    chatArea.innerHTML = '<div class="text-center text-gray-500 text-base mt-24">No messages to display</div>';
                    return;
                }

                const messagesToShow = this.filteredMessages.length ? this.filteredMessages : this.allMessages;
                const html = messagesToShow.map((msg, i) => {
                    const isSent = msg.sender_name === this.currentUser;
                    const showSender = !isSent && this.shouldShowSender(msg, i, messagesToShow);
                    const originalIndex = this.allMessages.indexOf(msg);
                    return this.renderMessage(msg, isSent, showSender, originalIndex);
                }).join('');

                chatArea.innerHTML = html;

                if (this.currentMatchIndex !== -1) {
                    this.scrollToCurrentMatch();
                } else {
                    this.scrollToBottom();
                }
            }

            shouldShowSender(message, index, messages) {
                if (index === 0) return true;
                return message.sender_name !== messages[index - 1].sender_name;
            }

            renderMessage(message, isSent, showSender, originalIndex) {
                const time = this.formatMessageDate(message);
                const senderHtml = showSender && !isSent ? 
                    `<div class="text-xs text-gray-500 mb-1 px-4">${message.sender_name || 'Unknown'}</div>` : '';
                
                let content = message.content || '[No content]';
                content = this.highlightSearchTerm(content, originalIndex);

                const messageClasses = isSent ? 
                    'justify-end' : 'justify-start';
                const bubbleClasses = isSent ?
                    'bg-message-blue text-white' : 'bg-message-gray text-black';

                return `
                    <div>
                        ${senderHtml}
                        <div class="flex mb-1 ${messageClasses}">
                            <div class="max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl px-4 py-3 rounded-2xl text-base leading-relaxed break-words ${bubbleClasses}">
                                ${content}
                            </div>
                        </div>
                        ${time ? `<div class="text-xs text-gray-500 mt-1 mb-2 ${isSent ? 'text-right' : 'text-left'} px-1">${time}</div>` : ''}
                    </div>
                `;
            }

            highlightSearchTerm(content, messageIndex) {
                const searchTerm = document.getElementById('searchInput').value.trim();
                
                if (!searchTerm) return content;

                const term = searchTerm.toLowerCase();
                const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, 'gi');
                
                return content.replace(regex, (match) => {
                    const isCurrent = this.currentMatchIndex !== -1 && 
                                    this.searchMatches[this.currentMatchIndex] === messageIndex;
                    const highlightClass = isCurrent ? 'current-match' : 'highlight';
                    return `<span class="${highlightClass}">${match}</span>`;
                });
            }

            formatMessageDate(message) {
                if (!message.timestamp_ms) return '';
                const date = new Date(message.timestamp_ms);
                return date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                });
            }

            updateRecipientName() {
                const recipientName = document.getElementById('recipientName');
                if (this.chatData.length === 1) {
                    recipientName.textContent = this.chatData[0].title || 'Chat';
                } else if (this.chatData.length > 1) {
                    recipientName.textContent = `${this.chatData.length} Conversations`;
                } else {
                    recipientName.textContent = 'Chat Viewer';
                }
            }

            // Utility methods
            scrollToBottom() {
                const chatArea = document.getElementById('chatArea');
                chatArea.scrollTop = chatArea.scrollHeight;
            }

            hideUploadOverlay() {
                document.getElementById('uploadOverlay').style.display = 'none';
            }

            showLoading(show) {
                const loading = document.getElementById('loading');
                if (show) {
                    loading.classList.remove('hidden');
                } else {
                    loading.classList.add('hidden');
                }
            }

            showError(message) {
                const chatArea = document.getElementById('chatArea');
                chatArea.innerHTML = `
                    <div class="text-center text-red-500 p-10">
                        <div class="text-5xl mb-4">⚠️</div>
                        <div class="text-lg">${message}</div>
                    </div>
                `;
            }

            escapeRegex(string) {
                return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }

            debounce(func, wait) {
                let timeout;
                return function executedFunction(...args) {
                    const later = () => {
                        clearTimeout(timeout);
                        func(...args);
                    };
                    clearTimeout(timeout);
                    timeout = setTimeout(later, wait);
                };
            }
        }

        // Initialize the chat viewer
        new ChatViewer();