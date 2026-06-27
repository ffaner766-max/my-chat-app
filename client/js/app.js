import CONFIG from './config.js';

// ========== DOM ЭЛЕМЕНТЫ ==========
const elements = {
    messages: document.getElementById('messages'),
    onlineCount: document.getElementById('onlineCount'),
    messageInput: document.getElementById('messageInput'),
    caseBtn: document.getElementById('caseBtn'),
    caseOverlay: document.getElementById('caseResultOverlay'),
    caseItemIcon: document.getElementById('caseItemIcon'),
    caseItemName: document.getElementById('caseItemName'),
    caseItemRarity: document.getElementById('caseItemRarity'),
    caseCloseBtn: document.getElementById('caseCloseBtn'),
    channelItems: document.querySelectorAll('.channel-item'),
    serverIcons: document.querySelectorAll('.server-icon'),
    chatActions: document.querySelectorAll('.chat-actions i'),
    userProfile: null,
    profileModal: null,
    typingStatus: null,
    fileInput: null,
    toastContainer: null
};

// ========== СОСТОЯНИЕ ==========
const state = {
    userId: null,
    username: 'User' + Math.random().toString(36).substr(2, 4),
    avatarColor: CONFIG.AVATAR_COLORS[Math.floor(Math.random() * CONFIG.AVATAR_COLORS.length)],
    avatarImage: null,
    bannerImage: null,
    status: 'online',
    customStatus: '',
    socket: null,
    isCaseCooldown: false,
    currentChannel: 'общий-чат',
    currentServer: 'main',
    onlineUsers: {},
    soundEnabled: true,
    messageHistory: []
};

// ========== ЗВУКИ ==========
function playSound(type) {
    if (!state.soundEnabled) return;
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        if (type === 'case') {
            oscillator.frequency.value = 523;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.15;
            oscillator.start();
            setTimeout(() => { oscillator.frequency.value = 659; }, 100);
            setTimeout(() => { oscillator.frequency.value = 784; }, 200);
            setTimeout(() => { oscillator.frequency.value = 1047; gainNode.gain.value = 0.2; }, 300);
            setTimeout(() => oscillator.stop(), 500);
        } else if (type === 'message') {
            oscillator.frequency.value = 440;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.08;
            oscillator.start();
            setTimeout(() => oscillator.stop(), 120);
        } else if (type === 'notification') {
            oscillator.frequency.value = 523;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.1;
            oscillator.start();
            setTimeout(() => { oscillator.frequency.value = 659; }, 150);
            setTimeout(() => { oscillator.frequency.value = 784; }, 300);
            setTimeout(() => oscillator.stop(), 450);
        }
    } catch (e) { /* тихо */ }
}

// ========== ПОДКЛЮЧЕНИЕ ==========
function initSocket() {
    state.socket = io(CONFIG.SERVER_URL, {
        maxHttpBufferSize: 1e8
    });

    state.socket.on('user data', (data) => {
        state.userId = data.userId;
        state.username = data.username;
        state.avatarColor = data.avatarColor;
        updateProfileUI();
    });

    state.socket.on('message history', (history) => {
        state.messageHistory = history;
        // Показываем историю в чате
        history.forEach(msg => {
            if (msg.type === 'text') {
                addMessage(msg.text, false, msg.username, msg.avatarColor, msg.userId);
            } else if (msg.type === 'image') {
                addImageMessage(msg.url, msg.username, msg.avatarColor, msg.userId);
            } else if (msg.type === 'file') {
                addFileMessage(msg.name, msg.size, msg.url, msg.username, msg.avatarColor, msg.userId);
            }
        });
    });

    state.socket.on('online count', (count) => {
        elements.onlineCount.textContent = count;
        const statusSpan = document.querySelector('.online-status span');
        if (statusSpan) statusSpan.textContent = count + ' онлайн';
    });

    state.socket.on('online users', (users) => {
        state.onlineUsers = users;
    });

    state.socket.on('chat message', (data) => {
        state.messageHistory.push(data);
        if (data.type === 'text') {
            addMessage(data.text, false, data.username, data.avatarColor, data.userId);
        } else if (data.type === 'image') {
            addImageMessage(data.url, data.username, data.avatarColor, data.userId);
        } else if (data.type === 'file') {
            addFileMessage(data.name, data.size, data.url, data.username, data.avatarColor, data.userId);
        }
    });

    state.socket.on('case result', (item) => {
        showCaseResult(item);
        addSystemMessage(`🎉 ${state.username} открыл кейс и получил: ${item.name} (${item.rarity})!`);
        playSound('case');
        showToast('🎁 Кейс открыт!', `${item.name} (${item.rarity})`);
    });

    state.socket.on('user updated', (data) => {
        updateMessagesByUser(data.userId, data.username, data.avatarColor);
        // Если обновили мы - обновляем UI
        if (data.userId === state.userId) {
            state.username = data.username;
            state.avatarColor = data.avatarColor;
            state.avatarImage = data.avatarImage;
            state.bannerImage = data.bannerImage;
            state.status = data.status;
            state.customStatus = data.customStatus;
            updateProfileUI();
        }
        showToast('👤 Профиль обновлён', `${data.username} изменил данные`);
    });

    state.socket.on('profile saved', () => {
        elements.profileModal.classList.remove('show');
        showToast('✅ Профиль сохранён!', `Теперь вы ${state.username}`);
    });

    state.socket.on('typing', (username) => {
        showTyping(username);
    });

    state.socket.on('connect_error', () => {
        addSystemMessage('⚠️ Ошибка подключения к серверу.');
    });
}

// ========== СООБЩЕНИЯ ==========
function addMessage(text, isSystem = false, username = null, avatarColor = null, userId = null) {
    const div = document.createElement('div');
    div.className = `message ${isSystem ? 'system' : ''}`;
    div.style.animation = 'fadeIn 0.3s ease';
    div.dataset.messageId = Date.now();
    div.dataset.userId = userId || state.userId;

    const displayName = username || state.username;
    const color = avatarColor || state.avatarColor;
    const isOwn = userId === state.userId;

    if (isSystem) {
        div.innerHTML = `
            <div class="message-content">
                <div class="message-text">${text}</div>
            </div>
        `;
    } else {
        let avatarHTML = displayName[0].toUpperCase();
        // Проверяем есть ли аватарка у пользователя
        if (state.avatarImage && isOwn) {
            avatarHTML = `<img src="${state.avatarImage}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
        div.innerHTML = `
            <div class="message-avatar" style="background: ${color}">
                ${avatarHTML}
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-username" style="${isOwn ? 'color: #5865f2;' : ''}">${displayName} ${isOwn ? '(Вы)' : ''}</span>
                    <span class="message-time">${getTime()}</span>
                </div>
                <div class="message-text">${escapeHtml(text)}</div>
            </div>
        `;
    }

    elements.messages.appendChild(div);
    elements.messages.scrollTop = elements.messages.scrollHeight;
    return div;
}

function addImageMessage(url, username, avatarColor, userId) {
    const div = addMessage('', false, username, avatarColor, userId);
    const img = document.createElement('img');
    img.src = url;
    img.className = 'message-image';
    img.onclick = () => window.open(url, '_blank');
    div.querySelector('.message-text').appendChild(img);
}

function addFileMessage(name, size, url, username, avatarColor, userId) {
    const div = addMessage('', false, username, avatarColor, userId);
    const fileSize = (size / 1024).toFixed(1) + ' KB';
    
    const isVideo = name.match(/\.(mp4|webm|ogg|mov|avi|mkv)$/i);
    const isAudio = name.match(/\.(mp3|wav|ogg|m4a|aac)$/i);
    
    let fileHTML = '';
    if (isVideo && url) {
        fileHTML = `
            <video controls class="message-video" preload="metadata">
                <source src="${url}" type="video/mp4">
                <source src="${url}" type="video/webm">
                <source src="${url}" type="video/ogg">
                Ваш браузер не поддерживает видео
            </video>
        `;
    } else if (isAudio && url) {
        fileHTML = `
            <audio controls style="width: 100%; max-width: 300px; margin-top: 4px;">
                <source src="${url}" type="audio/mpeg">
                <source src="${url}" type="audio/ogg">
                Ваш браузер не поддерживает аудио
            </audio>
        `;
    } else {
        fileHTML = `
            <div class="message-file">
                <i class="fas fa-file"></i>
                <span>${name}</span>
                <span style="color:#949ba4;font-size:12px;">(${fileSize})</span>
                <i class="fas fa-download" style="cursor:pointer;margin-left:8px;" onclick="window.open('${url}', '_blank')"></i>
            </div>
        `;
    }
    div.querySelector('.message-text').innerHTML = fileHTML;
}

function addSystemMessage(text) {
    addMessage(text, true);
}

function getTime() {
    return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== ОБНОВЛЕНИЕ СООБЩЕНИЙ ==========
function updateMessagesByUser(userId, newUsername, newAvatarColor) {
    const messages = elements.messages.querySelectorAll('.message:not(.system)');
    messages.forEach(msg => {
        const usernameEl = msg.querySelector('.message-username');
        const avatar = msg.querySelector('.message-avatar');
        if (usernameEl && msg.dataset.userId === userId) {
            const isOwn = userId === state.userId;
            usernameEl.textContent = newUsername + (isOwn ? ' (Вы)' : '');
            if (avatar) {
                if (state.avatarImage && isOwn) {
                    avatar.innerHTML = `<img src="${state.avatarImage}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                } else {
                    avatar.textContent = newUsername[0].toUpperCase();
                    avatar.style.background = newAvatarColor || '#5865f2';
                }
            }
        }
    });
}

// ========== ПРОФИЛЬ ==========
function updateProfileUI() {
    if (!elements.userProfile) return;
    const usernameEl = elements.userProfile.querySelector('.username');
    const statusEl = elements.userProfile.querySelector('.user-status');
    const avatarEl = elements.userProfile.querySelector('.avatar');
    
    if (usernameEl) usernameEl.textContent = state.username;
    if (statusEl) statusEl.textContent = state.customStatus || 'Без статуса';
    if (avatarEl) {
        if (state.avatarImage) {
            avatarEl.innerHTML = `<img src="${state.avatarImage}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else {
            avatarEl.textContent = state.username[0].toUpperCase();
            avatarEl.style.background = state.avatarColor;
        }
        const statusDot = avatarEl.querySelector('.status-dot');
        if (statusDot) statusDot.className = `status-dot ${state.status}`;
    }
}

function openProfile() {
    document.getElementById('profileUsername').value = state.username;
    document.getElementById('profileStatus').value = state.status;
    document.getElementById('profileCustomStatus').value = state.customStatus || '';
    
    const avatarPreview = document.getElementById('profileAvatarPreview');
    if (state.avatarImage) {
        avatarPreview.innerHTML = `<img src="${state.avatarImage}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
        avatarPreview.textContent = state.username[0].toUpperCase();
        avatarPreview.style.background = state.avatarColor;
    }
    
    const bannerPreview = document.getElementById('profileBannerPreview');
    if (state.bannerImage) {
        bannerPreview.innerHTML = `<img src="${state.bannerImage}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
        bannerPreview.innerHTML = `<div class="banner-overlay"><i class="fas fa-camera"></i></div>`;
    }
    
    elements.profileModal.classList.add('show');
}

function saveProfile() {
    const newUsername = document.getElementById('profileUsername').value.trim() || state.username;
    const newStatus = document.getElementById('profileStatus').value;
    const newCustomStatus = document.getElementById('profileCustomStatus').value.trim();

    state.username = newUsername;
    state.status = newStatus;
    state.customStatus = newCustomStatus;

    updateProfileUI();

    state.socket.emit('update profile', {
        username: newUsername,
        status: newStatus,
        avatarColor: state.avatarColor,
        avatarImage: state.avatarImage,
        bannerImage: state.bannerImage,
        customStatus: newCustomStatus
    });
}

// ========== ОТПРАВКА ФАЙЛА ==========
function sendFile(file) {
    const reader = new FileReader();
    
    // Проверяем размер
    if (file.size > 50 * 1024 * 1024) { // 50MB
        showToast('❌ Ошибка!', 'Файл слишком большой (макс. 50MB)');
        return;
    }
    
    if (file.type.startsWith('image/')) {
        reader.onload = (e) => {
            state.socket.emit('chat message', { type: 'image', url: e.target.result });
            showToast('📸 Фото отправлено!', file.name);
        };
        reader.readAsDataURL(file);
    } else {
        reader.onload = (e) => {
            state.socket.emit('chat message', { 
                type: 'file', 
                name: file.name, 
                size: file.size,
                url: e.target.result 
            });
            const emoji = file.type.startsWith('video/') ? '🎬' : '📁';
            showToast(`${emoji} Файл отправлен!`, file.name);
        };
        reader.readAsDataURL(file);
    }
    playSound('message');
}

// ========== ЗАГРУЗКА АВАТАРКИ ==========
function uploadAvatar(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        state.avatarImage = e.target.result;
        updateProfileUI();
        const avatarPreview = document.getElementById('profileAvatarPreview');
        if (avatarPreview) {
            avatarPreview.innerHTML = `<img src="${state.avatarImage}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
        showToast('🖼️ Аватар обновлён!', 'Новая аватарка установлена');
        // Автоматически сохраняем
        saveProfile();
    };
    reader.readAsDataURL(file);
}

function uploadBanner(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        state.bannerImage = e.target.result;
        const bannerPreview = document.getElementById('profileBannerPreview');
        if (bannerPreview) {
            bannerPreview.innerHTML = `<img src="${state.bannerImage}" style="width:100%;height:100%;object-fit:cover;">`;
        }
        showToast('🖼️ Баннер обновлён!', 'Новый баннер установлен');
        // Автоматически сохраняем
        saveProfile();
    };
    reader.readAsDataURL(file);
}

// ========== УВЕДОМЛЕНИЯ ==========
function showToast(title, body) {
    if (!elements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <div class="toast-title">${title}</div>
        <div class="toast-body">${body}</div>
    `;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ========== ТИПИНГ ==========
let typingTimeout = null;

function showTyping(username) {
    if (!elements.typingStatus) return;
    elements.typingStatus.innerHTML = `
        <span>${username} печатает</span>
        <div class="typing-dots"><span></span><span></span><span></span></div>
    `;
    elements.typingStatus.classList.add('show');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        elements.typingStatus.classList.remove('show');
    }, 3000);
}

// ========== ПЕРЕКЛЮЧЕНИЕ ==========
function switchChannel(channelName, element) {
    elements.channelItems.forEach(item => item.classList.remove('active'));
    if (element) element.classList.add('active');
    state.currentChannel = channelName;
    elements.messages.innerHTML = '';
    state.messageHistory = [];
    setTimeout(() => {
        addSystemMessage(`📢 Вы перешли в канал #${channelName}`);
        addSystemMessage(`💬 Добро пожаловать в ${channelName}!`);
    }, 200);
    const header = document.querySelector('.chat-info h3');
    if (header) header.textContent = channelName;
}

function switchServer(serverId, element) {
    elements.serverIcons.forEach(icon => icon.classList.remove('active'));
    if (element) element.classList.add('active');
    state.currentServer = serverId;
    const serverNames = {
        'main': '🎮 Игровой сервер',
        'games': '🎯 Игровой сервер',
        'gem': '💎 Гем сервер'
    };
    const nameEl = document.querySelector('.server-name');
    if (nameEl) {
        nameEl.innerHTML = (serverNames[serverId] || '🎮 Игровой сервер') + ' <i class="fas fa-chevron-down"></i>';
    }
    elements.messages.innerHTML = '';
    state.messageHistory = [];
    setTimeout(() => {
        addSystemMessage(`🔄 Переключились на сервер ${serverNames[serverId] || ''}`);
        addSystemMessage(`💡 Выберите канал слева`);
    }, 200);
}

// ========== КЕЙС ==========
function openCase() {
    if (state.isCaseCooldown || !state.socket) return;
    state.socket.emit('open case');
    state.isCaseCooldown = true;
    elements.caseBtn.disabled = true;
    elements.caseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Открываем...';
    setTimeout(() => {
        elements.caseBtn.innerHTML = '<i class="fas fa-gift"></i> Кейс';
        elements.caseBtn.disabled = false;
        state.isCaseCooldown = false;
    }, CONFIG.CASE_COOLDOWN);
}

function showCaseResult(item) {
    elements.caseItemIcon.textContent = item.name.split(' ')[0] || '🎁';
    elements.caseItemName.textContent = item.name;
    elements.caseItemRarity.textContent = item.rarity;
    elements.caseItemRarity.className = `item-rarity rarity-${item.rarity}`;
    elements.caseOverlay.classList.add('show');
}

function hideCaseResult() {
    elements.caseOverlay.classList.remove('show');
}

// ========== ОТПРАВКА СООБЩЕНИЯ ==========
function sendMessage() {
    const text = elements.messageInput.value.trim();
    if (text && state.socket) {
        state.socket.emit('chat message', { type: 'text', text });
        elements.messageInput.value = '';
        playSound('message');
    }
}

// ========== СОБЫТИЯ ==========
function initEvents() {
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
        if (e.key.length === 1 && state.socket) {
            state.socket.emit('typing', state.username);
        }
    });

    elements.caseBtn.addEventListener('click', openCase);
    elements.caseCloseBtn.addEventListener('click', hideCaseResult);
    elements.caseOverlay.addEventListener('click', (e) => {
        if (e.target === elements.caseOverlay) hideCaseResult();
    });

    elements.channelItems.forEach((item, index) => {
        item.addEventListener('click', function() {
            const channelName = this.textContent.trim().split(' ')[0] || 'канал-' + index;
            switchChannel(channelName, this);
            playSound('message');
        });
    });

    elements.serverIcons.forEach((icon, index) => {
        icon.addEventListener('click', function() {
            const serverId = ['main', 'games', 'gem', 'plus'][index] || 'server-' + index;
            switchServer(serverId, this);
            playSound('message');
        });
    });

    elements.chatActions.forEach((action, index) => {
        action.addEventListener('click', function() {
            this.classList.toggle('active');
            const actions = ['Поиск', 'Закрепить', 'Уведомления', 'Пригласить'];
            if (actions[index]) {
                showToast(`🔧 ${actions[index]}`, 'Функция в разработке');
            }
        });
    });

    if (elements.userProfile) {
        elements.userProfile.addEventListener('click', openProfile);
    }
    
    const closeBtn = document.querySelector('.profile-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => elements.profileModal.classList.remove('show'));
    if (elements.profileModal) {
        elements.profileModal.addEventListener('click', (e) => {
            if (e.target === elements.profileModal) elements.profileModal.classList.remove('show');
        });
    }
    
    const saveBtn = document.getElementById('profileSave');
    if (saveBtn) saveBtn.addEventListener('click', saveProfile);
    
    const cancelBtn = document.getElementById('profileCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => elements.profileModal.classList.remove('show'));

    const avatarUpload = document.getElementById('avatarUpload');
    if (avatarUpload) {
        avatarUpload.addEventListener('change', (e) => {
            if (e.target.files.length > 0) uploadAvatar(e.target.files[0]);
            e.target.value = '';
        });
    }
    const avatarClick = document.querySelector('.profile-avatar');
    if (avatarClick) {
        avatarClick.addEventListener('click', () => document.getElementById('avatarUpload')?.click());
    }

    const bannerUpload = document.getElementById('bannerUpload');
    if (bannerUpload) {
        bannerUpload.addEventListener('change', (e) => {
            if (e.target.files.length > 0) uploadBanner(e.target.files[0]);
            e.target.value = '';
        });
    }
    const bannerClick = document.querySelector('.profile-banner');
    if (bannerClick) {
        bannerClick.addEventListener('click', () => document.getElementById('bannerUpload')?.click());
    }

    const fileUploadBtn = document.getElementById('fileUpload');
    if (fileUploadBtn) {
        fileUploadBtn.addEventListener('click', () => elements.fileInput?.click());
    }
    if (elements.fileInput) {
        elements.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) sendFile(e.target.files[0]);
            e.target.value = '';
        });
    }

    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
        soundToggle.addEventListener('click', () => {
            state.soundEnabled = !state.soundEnabled;
            soundToggle.classList.toggle('active');
            soundToggle.querySelector('i').className = state.soundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
            showToast(state.soundEnabled ? '🔊 Звук включён' : '🔇 Звук выключен', '');
        });
    }

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// ========== ЗАПУСК ==========
function init() {
    // Профиль
    const profileHTML = `
        <div class="user-profile">
            <div class="avatar" style="background: ${state.avatarColor}">
                ${state.username[0].toUpperCase()}
                <div class="status-dot online"></div>
            </div>
            <div class="user-info">
                <div class="username">${state.username}</div>
                <div class="user-status">Без статуса</div>
            </div>
            <div class="user-actions">
                <i class="fas fa-microphone"></i>
                <i class="fas fa-headphones"></i>
                <i class="fas fa-cog"></i>
            </div>
        </div>
    `;
    document.querySelector('.app').insertAdjacentHTML('beforeend', profileHTML);
    elements.userProfile = document.querySelector('.user-profile');

    // Модалка профиля
    const modalHTML = `
        <div class="profile-modal" id="profileModal">
            <div class="profile-modal-content">
                <div class="profile-close-btn">&times;</div>
                <div class="profile-banner" id="profileBannerPreview">
                    <div class="banner-overlay"><i class="fas fa-camera"></i></div>
                </div>
                <input type="file" id="bannerUpload" accept="image/*" style="display:none;">
                <div class="profile-avatar-wrapper">
                    <div class="profile-avatar" id="profileAvatarPreview" style="background: ${state.avatarColor}">
                        ${state.username[0].toUpperCase()}
                        <div class="avatar-edit-overlay"><i class="fas fa-camera"></i></div>
                    </div>
                    <input type="file" id="avatarUpload" accept="image/*" style="display:none;">
                    <div class="profile-username-info">
                        <div class="profile-username" id="profileDisplayName">${state.username}</div>
                        <div class="profile-discord-tag">#${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}</div>
                    </div>
                </div>
                <div class="profile-info">
                    <div class="profile-status-text">
                        <i class="fas fa-circle" style="color:#23a55a;font-size:12px;"></i>
                        <span id="profileStatusDisplay">Онлайн</span>
                        <span style="color:#949ba4;margin-left:8px;" id="profileCustomStatusDisplay">${state.customStatus || ''}</span>
                    </div>
                </div>
                <div class="profile-edit">
                    <label>Имя пользователя</label>
                    <input type="text" id="profileUsername" value="${state.username}" />
                    <label>Статус</label>
                    <select id="profileStatus">
                        <option value="online">🟢 Онлайн</option>
                        <option value="idle">🟡 Не активен</option>
                        <option value="dnd">🔴 Не беспокоить</option>
                        <option value="offline">⚫ Невидимка</option>
                    </select>
                    <label>Пользовательский статус</label>
                    <input type="text" id="profileCustomStatus" placeholder="Напишите статус..." value="${state.customStatus || ''}" />
                    <div class="edit-actions">
                        <button class="cancel-btn" id="profileCancel">Отмена</button>
                        <button class="save-btn" id="profileSave">💾 Сохранить</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    elements.profileModal = document.getElementById('profileModal');

    // Тосты
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.id = 'toastContainer';
    document.body.appendChild(toastContainer);
    elements.toastContainer = toastContainer;

    // Файлы
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'fileInput';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    elements.fileInput = fileInput;

    // Кнопка загрузки файла
    const fileUploadBtn = document.createElement('i');
    fileUploadBtn.id = 'fileUpload';
    fileUploadBtn.className = 'fas fa-paperclip';
    fileUploadBtn.style.cursor = 'pointer';
    const firstIcon = document.querySelector('.input-wrapper i:first-child');
    if (firstIcon) firstIcon.after(fileUploadBtn);

    // Звук
    const soundToggle = document.createElement('div');
    soundToggle.className = 'sound-toggle active';
    soundToggle.id = 'soundToggle';
    soundToggle.innerHTML = '<i class="fas fa-volume-up"></i>';
    document.body.appendChild(soundToggle);

    // Печатает
    const typingStatus = document.createElement('div');
    typingStatus.className = 'typing-status';
    typingStatus.id = 'typingStatus';
    const messagesEl = document.querySelector('.messages');
    if (messagesEl) messagesEl.after(typingStatus);
    elements.typingStatus = typingStatus;

    initSocket();
    initEvents();
    setTimeout(() => {
        addSystemMessage(`👋 Добро пожаловать, ${state.username}!`);
        addSystemMessage(`📌 Нажми на профиль внизу чтобы настроить аватарку и баннер`);
        addSystemMessage(`💡 Напиши сообщение или открой кейс!`);
        addSystemMessage(`📎 Кликни на скрепку чтобы отправить файл или видео`);
    }, 300);
}

document.addEventListener('DOMContentLoaded', init);