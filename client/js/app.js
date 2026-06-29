import CONFIG from './config.js';

// ===== DOM =====
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
    userProfile: null,
    profileModal: null,
    toastContainer: null
};

// ===== СОСТОЯНИЕ =====
const state = {
    userId: localStorage.getItem('chat_user_id') || 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    username: localStorage.getItem('chat_username') || 'User' + Math.floor(Math.random() * 10000),
    avatarColor: localStorage.getItem('chat_avatarColor') || CONFIG.AVATAR_COLORS[Math.floor(Math.random() * CONFIG.AVATAR_COLORS.length)],
    status: localStorage.getItem('chat_status') || 'online',
    customStatus: localStorage.getItem('chat_customStatus') || '',
    supabase: null,
    isCaseCooldown: false,
    soundEnabled: true
};

// ===== СОХРАНЕНИЕ =====
function saveState() {
    localStorage.setItem('chat_user_id', state.userId);
    localStorage.setItem('chat_username', state.username);
    localStorage.setItem('chat_avatarColor', state.avatarColor);
    localStorage.setItem('chat_status', state.status);
    localStorage.setItem('chat_customStatus', state.customStatus || '');
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
async function initSupabase() {
    state.supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    
    await registerUser();
    await loadMessages();
    
    // Подписка на новые сообщения
    state.supabase
        .channel('messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            const msg = payload.new;
            addMessage(msg.text, false, msg.username, msg.avatar_color, msg.user_id);
            playSound('message');
        })
        .subscribe();
    
    // Подписка на изменения онлайна
    state.supabase
        .channel('online_users')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'online_users' }, () => {
            updateOnlineCount();
        })
        .subscribe();
    
    await updateOnlineStatus();
    setInterval(updateOnlineStatus, 10000);
    setInterval(updateOnlineCount, 5000);
}

// ===== РЕГИСТРАЦИЯ =====
async function registerUser() {
    const { data: existing } = await state.supabase
        .from('online_users')
        .select('*')
        .eq('user_id', state.userId)
        .maybeSingle();
    
    if (existing) {
        state.username = existing.username;
        state.avatarColor = existing.avatar_color || state.avatarColor;
        state.status = existing.status || 'online';
        state.customStatus = existing.custom_status || '';
        saveState();
        updateProfileUI();
        return;
    }
    
    await state.supabase
        .from('online_users')
        .insert([{
            user_id: state.userId,
            username: state.username,
            avatar_color: state.avatarColor,
            status: state.status,
            custom_status: state.customStatus,
            last_seen: new Date().toISOString()
        }]);
    
    saveState();
    updateProfileUI();
}

// ===== СООБЩЕНИЯ =====
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

// ===== ОНЛАЙН =====
async function updateOnlineStatus() {
    if (!state.supabase) return;
    
    await state.supabase
        .from('online_users')
        .update({ last_seen: new Date().toISOString() })
        .eq('user_id', state.userId);
    
    await updateOnlineCount();
}

async function updateOnlineCount() {
    if (!state.supabase) return;
    
    const { data, error } = await state.supabase
        .from('online_users')
        .select('user_id')
        .gte('last_seen', new Date(Date.now() - 60000).toISOString());
    
    if (!error && data) {
        const count = data.length;
        elements.onlineCount.textContent = count;
        const statusSpan = document.querySelector('.online-status span');
        if (statusSpan) statusSpan.textContent = count + ' онлайн';
    }
}

// ===== КЕЙС =====
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
    if (random < 0.5) filteredItems = items.filter(item => item.rarity === 'Обычный');
    else if (random < 0.8) filteredItems = items.filter(item => item.rarity === 'Редкий');
    else if (random < 0.95) filteredItems = items.filter(item => item.rarity === 'Легендарный');
    else filteredItems = items.filter(item => item.rarity === 'Мифический');
    
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

// ===== UI =====
function addMessage(text, isSystem = false, username = null, avatarColor = null, userId = null) {
    const div = document.createElement('div');
    div.className = `message ${isSystem ? 'system' : ''}`;
    div.style.animation = 'fadeIn 0.3s ease';

    const displayName = username || state.username;
    const color = avatarColor || state.avatarColor;
    const isOwn = userId === state.userId;

    if (isSystem) {
        div.innerHTML = `<div class="message-content"><div class="message-text">${text}</div></div>`;
    } else {
        div.innerHTML = `
            <div class="message-avatar" style="background: ${color}">${displayName[0].toUpperCase()}</div>
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

// ===== ЗВУКИ =====
function playSound(type) {
    if (!state.soundEnabled) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        if (type === 'case') {
            osc.frequency.value = 523;
            gain.gain.value = 0.15;
            osc.start();
            setTimeout(() => osc.frequency.value = 659, 100);
            setTimeout(() => osc.frequency.value = 784, 200);
            setTimeout(() => osc.frequency.value = 1047, 300);
            setTimeout(() => osc.stop(), 500);
        } else if (type === 'message') {
            osc.frequency.value = 440;
            gain.gain.value = 0.08;
            osc.start();
            setTimeout(() => osc.stop(), 120);
        }
    } catch (e) {}
}

// ===== УВЕДОМЛЕНИЯ =====
function showToast(title, body) {
    if (!elements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-body">${body}</div>`;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ===== ПРОФИЛЬ =====
function openProfile() {
    document.getElementById('profileUsername').value = state.username;
    document.getElementById('profileStatus').value = state.status;
    document.getElementById('profileCustomStatus').value = state.customStatus || '';
    elements.profileModal.classList.add('show');
}

function saveProfile() {
    state.username = document.getElementById('profileUsername').value.trim() || state.username;
    state.status = document.getElementById('profileStatus').value;
    state.customStatus = document.getElementById('profileCustomStatus').value.trim();
    
    saveState();
    updateProfileUI();
    elements.profileModal.classList.remove('show');
    
    state.supabase
        .from('online_users')
        .update({
            username: state.username,
            avatar_color: state.avatarColor,
            status: state.status,
            custom_status: state.customStatus
        })
        .eq('user_id', state.userId);
    
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

// ===== ПЕРЕКЛЮЧЕНИЕ =====
function switchChannel(channelName, element) {
    elements.channelItems.forEach(item => item.classList.remove('active'));
    if (element) element.classList.add('active');
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
    const names = { main: '🎮 Игровой сервер', games: '🎯 Игровой сервер', gem: '💎 Гем сервер' };
    document.querySelector('.server-name').innerHTML = (names[serverId] || '🎮 Игровой сервер') + ' <i class="fas fa-chevron-down"></i>';
    elements.messages.innerHTML = '';
    setTimeout(() => {
        addSystemMessage(`🔄 Переключились на сервер ${names[serverId] || ''}`);
        addSystemMessage(`💡 Выберите канал слева`);
    }, 200);
}

// ===== СОБЫТИЯ =====
function initEvents() {
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    elements.caseBtn.addEventListener('click', openCase);
    elements.caseCloseBtn.addEventListener('click', hideCaseResult);
    elements.caseOverlay.addEventListener('click', (e) => {
        if (e.target === elements.caseOverlay) hideCaseResult();
    });

    elements.channelItems.forEach((item) => {
        item.addEventListener('click', function() {
            const name = this.textContent.trim().split(' ')[0] || 'канал';
            switchChannel(name, this);
            document.getElementById('channelsPanel')?.classList.remove('open');
        });
    });

    elements.serverIcons.forEach((icon, index) => {
        icon.addEventListener('click', function() {
            const id = ['main', 'games', 'gem', 'plus'][index] || 'server-' + index;
            switchServer(id, this);
        });
    });

    if (elements.userProfile) {
        elements.userProfile.addEventListener('click', openProfile);
    }
    
    document.querySelector('.profile-close-btn')?.addEventListener('click', () => elements.profileModal?.classList.remove('show'));
    document.getElementById('profileSave')?.addEventListener('click', saveProfile);
    document.getElementById('profileCancel')?.addEventListener('click', () => elements.profileModal?.classList.remove('show'));

    document.getElementById('soundToggle')?.addEventListener('click', function() {
        state.soundEnabled = !state.soundEnabled;
        this.classList.toggle('active');
        this.querySelector('i').className = state.soundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
    });

    // Гамбургер
    const menuToggle = document.getElementById('menuToggle');
    const channelsPanel = document.getElementById('channelsPanel');
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    document.body.appendChild(overlay);

    menuToggle?.addEventListener('click', () => {
        channelsPanel?.classList.toggle('open');
        overlay.classList.toggle('show');
    });

    overlay.addEventListener('click', () => {
        channelsPanel?.classList.remove('open');
        overlay.classList.remove('show');
    });
}

// ===== ЗАПУСК =====
async function init() {
    // Профиль
    const profileHTML = `
        <div class="user-profile">
            <div class="avatar" style="background: ${state.avatarColor}">${state.username[0].toUpperCase()}<div class="status-dot online"></div></div>
            <div class="user-info">
                <div class="username">${state.username}</div>
                <div class="user-status">${state.customStatus || 'Без статуса'}</div>
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

    // Модалка
    const modalHTML = `
        <div class="profile-modal" id="profileModal">
            <div class="profile-modal-content">
                <div class="profile-close-btn">&times;</div>
                <div class="profile-banner" id="profileBannerPreview"><div class="banner-overlay"><i class="fas fa-camera"></i></div></div>
                <div class="profile-avatar-wrapper">
                    <div class="profile-avatar" id="profileAvatarPreview" style="background: ${state.avatarColor}">${state.username[0].toUpperCase()}<div class="avatar-edit-overlay"><i class="fas fa-camera"></i></div></div>
                    <div class="profile-username-info">
                        <div class="profile-username">${state.username}</div>
                        <div class="profile-discord-tag">#${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}</div>
                    </div>
                </div>
                <div class="profile-info">
                    <div class="profile-status-text"><i class="fas fa-circle" style="color:#23a55a;font-size:12px;"></i> <span id="profileStatusDisplay">Онлайн</span> <span style="color:#949ba4;margin-left:8px;" id="profileCustomStatusDisplay">${state.customStatus || ''}</span></div>
                </div>
                <div class="profile-edit">
                    <label>Имя пользователя</label>
                    <input type="text" id="profileUsername" value="${state.username}" />
                    <label>Статус</label>
                    <select id="profileStatus">
                        <option value="online" ${state.status === 'online' ? 'selected' : ''}>🟢 Онлайн</option>
                        <option value="idle" ${state.status === 'idle' ? 'selected' : ''}>🟡 Не активен</option>
                        <option value="dnd" ${state.status === 'dnd' ? 'selected' : ''}>🔴 Не беспокоить</option>
                        <option value="offline" ${state.status === 'offline' ? 'selected' : ''}>⚫ Невидимка</option>
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

document.addEventListener('DOMContentLoaded', init);
