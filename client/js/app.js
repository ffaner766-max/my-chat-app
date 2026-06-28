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
    userId: 'user_' + Math.random().toString(36).substr(2, 9),
    username: 'User' + Math.floor(Math.random() * 10000),
    avatarColor: CONFIG.AVATAR_COLORS[Math.floor(Math.random() * CONFIG.AVATAR_COLORS.length)],
    avatarImage: null,
    bannerImage: null,
    status: 'online',
    customStatus: '',
    isCaseCooldown: false,
    currentChannel: 'общий-чат',
    currentServer: 'main',
    soundEnabled: true,
    supabase: null
};

// ========== ПОДКЛЮЧЕНИЕ К SUPABASE ==========
async function initSupabase() {
    state.supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    
    // Подписываемся на новые сообщения
    state.supabase
        .channel('messages')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages' 
        }, (payload) => {
            const msg = payload.new;
            addMessage(msg.text, false, msg.username, msg.avatar_color, msg.user_id);
            playSound('message');
        })
        .subscribe();

    // Загружаем историю сообщений
    await loadMessages();
    
    // Обновляем онлайн
    await updateOnlineStatus();
    setInterval(updateOnlineStatus, 15000);
    
    // Подписываемся на изменения онлайна
    state.supabase
        .channel('online_users')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'online_users' 
        }, () => {
            updateOnlineCount();
        })
        .subscribe();
}

// ========== ЗАГРУЗКА СООБЩЕНИЙ ==========
async function loadMessages() {
    const { data, error } = await state.supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100);
    
    if (error) {
        console.error('Ошибка загрузки сообщений:', error);
        return;
    }
    
    elements.messages.innerHTML = '';
    data.forEach(msg => {
        addMessage(msg.text, false, msg.username, msg.avatar_color, msg.user_id);
    });
}

// ========== ОТПРАВКА СООБЩЕНИЯ ==========
async function sendMessage() {
    const text = elements.messageInput.value.trim();
    if (!text || !state.supabase) return;

    const { error } = await state.supabase
        .from('messages')
        .insert([{
            username: state.username,
            text: text,
            avatar_color: state.avatarColor,
            user_id: state.userId
        }]);

    if (error) {
        console.error('Ошибка отправки:', error);
        showToast('❌ Ошибка', 'Не удалось отправить сообщение');
    } else {
        elements.messageInput.value = '';
        playSound('message');
    }
}

// ========== ОНЛАЙН ==========
async function updateOnlineStatus() {
    if (!state.supabase) return;
    
    await state.supabase
        .from('online_users')
        .upsert([{
            user_id: state.userId,
            username: state.username,
            last_seen: new Date().toISOString()
        }]);
    
    await updateOnlineCount();
}

async function updateOnlineCount() {
    if (!state.supabase) return;
    
    const { data, error } = await state.supabase
        .from('online_users')
        .select('user_id', { count: 'exact' })
        .gte('last_seen', new Date(Date.now() - 60000).toISOString());
    
    if (!error && data) {
        const count = data.length;
        elements.onlineCount.textContent = count;
        const statusSpan = document.querySelector('.online-status span');
        if (statusSpan) statusSpan.textContent = count + ' онлайн';
    }
}

// ========== КЕЙС ==========
function openCase() {
    if (state.isCaseCooldown) return;
    
    const items = [
        { name: '🔫 Пистолет', rarity: 'Обычный' },
        { name: '🔪 Нож', rarity: 'Редкий' },
        { name: '💰 100 монет', rarity: 'Обычный' },
        { name: '💎 Легендарный скин', rarity: 'Легендарный' },
        { name: '🎯 Точность +10', rarity: 'Редкий' },
        { name: '👑 Королевский набор', rarity: 'Мифический' }
    ];
    
    const random = Math.random();
    let filteredItems;
    if (random < 0.5) {
        filteredItems = items.filter(item => item.rarity === 'Обычный');
    } else if (random < 0.8) {
        filteredItems = items.filter(item => item.rarity === 'Редкий');
    } else if (random < 0.95) {
        filteredItems = items.filter(item => item.rarity === 'Легендарный');
    } else {
        filteredItems = items.filter(item => item.rarity === 'Мифический');
    }
    const prize = filteredItems[Math.floor(Math.random() * filteredItems.length)];
    
    showCaseResult(prize);
    addSystemMessage(`🎉 ${state.username} открыл кейс и получил: ${prize.name} (${prize.rarity})!`);
    playSound('case');
    showToast('🎁 Кейс открыт!', `${prize.name} (${prize.rarity})`);
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

// ========== СООБЩЕНИЯ (UI) ==========
function addMessage(text, isSystem = false, username = null, avatarColor = null, userId = null) {
    const div = document.createElement('div');
    div.className = `message ${isSystem ? 'system' : ''}`;
    div.style.animation = 'fadeIn 0.3s ease';
    div.dataset.messageId = Date.now();

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
        div.innerHTML = `
            <div class="message-avatar" style="background: ${color}">
                ${avatarHTML}
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-username" style="${isOwn ? 'color: #5865f2;' : ''}">${displayName} ${isOwn ? '(Вы)' : ''}</span>
                    <span class="message-time">${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="message-text">${escapeHtml(text)}</div>
            </div>
        `;
    }

    elements.messages.appendChild(div);
    elements.messages.scrollTop = elements.messages.scrollHeight;
}

function addSystemMessage(text) {
    addMessage(text, true);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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
            setTimeout(() => oscillator.frequency.value = 659, 100);
            setTimeout(() => oscillator.frequency.value = 784, 200);
            setTimeout(() => oscillator.frequency.value = 1047, 300);
            setTimeout(() => oscillator.stop(), 500);
        } else if (type === 'message') {
            oscillator.frequency.value = 440;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.08;
            oscillator.start();
            setTimeout(() => oscillator.stop(), 120);
        }
    } catch (e) {}
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

// ========== ПЕРЕКЛЮЧЕНИЕ КАНАЛОВ ==========
function switchChannel(channelName, element) {
    elements.channelItems.forEach(item => item.classList.remove('active'));
    if (element) element.classList.add('active');
    state.currentChannel = channelName;
    elements.messages.innerHTML = '';
    setTimeout(() => {
        addSystemMessage(`📢 Вы перешли в канал #${channelName}`);
        addSystemMessage(`💬 Добро пожаловать в ${channelName}!`);
    }, 200);
    document.querySelector('.chat-info h3').textContent = channelName;
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
    document.querySelector('.server-name').innerHTML = 
        (serverNames[serverId] || '🎮 Игровой сервер') + ' <i class="fas fa-chevron-down"></i>';
    elements.messages.innerHTML = '';
    setTimeout(() => {
        addSystemMessage(`🔄 Переключились на сервер ${serverNames[serverId] || ''}`);
        addSystemMessage(`💡 Выберите канал слева`);
    }, 200);
}

// ========== ПРОФИЛЬ ==========
function openProfile() {
    document.getElementById('profileUsername').value = state.username;
    document.getElementById('profileStatus').value = state.status;
    document.getElementById('profileCustomStatus').value = state.customStatus || '';
    elements.profileModal.classList.add('show');
}

function saveProfile() {
    const newUsername = document.getElementById('profileUsername').value.trim() || state.username;
    state.username = newUsername;
    state.status = document.getElementById('profileStatus').value;
    state.customStatus = document.getElementById('profileCustomStatus').value.trim();
    updateProfileUI();
    elements.profileModal.classList.remove('show');
    showToast('✅ Профиль обновлён!', `Теперь вы ${state.username}`);
}

function updateProfileUI() {
    if (!elements.userProfile) return;
    elements.userProfile.querySelector('.username').textContent = state.username;
    elements.userProfile.querySelector('.user-status').textContent = state.customStatus || 'Без статуса';
    const avatar = elements.userProfile.querySelector('.avatar');
    avatar.textContent = state.username[0].toUpperCase();
    avatar.style.background = state.avatarColor;
}

// ========== СОБЫТИЯ ==========
function initEvents() {
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
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
            // Закрываем меню на телефоне
            document.getElementById('channelsPanel')?.classList.remove('open');
            document.querySelector('.overlay')?.classList.remove('show');
        });
    });

    elements.serverIcons.forEach((icon, index) => {
        icon.addEventListener('click', function() {
            const serverId = ['main', 'games', 'gem', 'plus'][index] || 'server-' + index;
            switchServer(serverId, this);
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
    
    const saveBtn = document.getElementById('profileSave');
    if (saveBtn) saveBtn.addEventListener('click', saveProfile);
    
    const cancelBtn = document.getElementById('profileCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => elements.profileModal.classList.remove('show'));

    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
        soundToggle.addEventListener('click', () => {
            state.soundEnabled = !state.soundEnabled;
            soundToggle.classList.toggle('active');
            soundToggle.querySelector('i').className = state.soundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
            showToast(state.soundEnabled ? '🔊 Звук включён' : '🔇 Звук выключен', '');
        });
    }

    // ===== КНОПКА ГАМБУРГЕР (ТЕЛЕФОН) =====
    const menuToggle = document.getElementById('menuToggle');
    const channelsPanel = document.getElementById('channelsPanel');
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    document.body.appendChild(overlay);

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            channelsPanel.classList.toggle('open');
            overlay.classList.toggle('show');
        });
    }

    overlay.addEventListener('click', () => {
        channelsPanel.classList.remove('open');
        overlay.classList.remove('show');
    });
}

// ========== ЗАПУСК ==========
async function init() {
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
                <div class="profile-avatar-wrapper">
                    <div class="profile-avatar" id="profileAvatarPreview" style="background: ${state.avatarColor}">
                        ${state.username[0].toUpperCase()}
                        <div class="avatar-edit-overlay"><i class="fas fa-camera"></i></div>
                    </div>
                    <div class="profile-username-info">
                        <div class="profile-username">${state.username}</div>
                        <div class="profile-discord-tag">#${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}</div>
                    </div>
                </div>
                <div class="profile-info">
                    <div class="profile-status-text">
                        <i class="fas fa-circle" style="color:#23a55a;font-size:12px;"></i>
                        <span id="profileStatusDisplay">Онлайн</span>
                        <span style="color:#949ba4;margin-left:8px;" id="profileCustomStatusDisplay"></span>
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
                    <input type="text" id="profileCustomStatus" placeholder="Напишите статус..." />
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

    // Звук
    const soundToggle = document.createElement('div');
    soundToggle.className = 'sound-toggle active';
    soundToggle.id = 'soundToggle';
    soundToggle.innerHTML = '<i class="fas fa-volume-up"></i>';
    document.body.appendChild(soundToggle);

    initEvents();
    await initSupabase();
    
    setTimeout(() => {
        addSystemMessage(`👋 Добро пожаловать, ${state.username}!`);
        addSystemMessage(`💡 Напиши сообщение или открой кейс!`);
    }, 500);
}

// ========== ФИКС ДЛЯ ТЕЛЕФОНА: обновляем онлайн при переключении вкладок ==========
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        updateOnlineStatus();
    }
});

// Обновляем онлайн при загрузке страницы (для телефона)
window.addEventListener('load', () => {
    setTimeout(updateOnlineStatus, 2000);
});

document.addEventListener('DOMContentLoaded', init);