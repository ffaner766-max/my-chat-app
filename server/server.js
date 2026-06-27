const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e8 // 100MB для видео
});

// Раздаем статику
app.use(express.static(path.join(__dirname, '../client')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ========== СОСТОЯНИЕ ==========
let onlineUsers = {};
let messageHistory = []; // Сохраняем историю сообщений
const MAX_HISTORY = 100;

const caseItems = [
    { name: '🔫 Пистолет', rarity: 'Обычный' },
    { name: '🔪 Нож', rarity: 'Редкий' },
    { name: '💰 100 монет', rarity: 'Обычный' },
    { name: '💎 Легендарный скин', rarity: 'Легендарный' },
    { name: '🎯 Точность +10', rarity: 'Редкий' },
    { name: '👑 Королевский набор', rarity: 'Мифический' }
];

// ========== СОКЕТЫ ==========
io.on('connection', (socket) => {
    const username = 'User' + Math.floor(Math.random() * 10000);
    const avatarColor = ['#5865f2', '#faa81a', '#f47b1a', '#23a55a', '#ed4245', '#eb459e', '#f0b232'][Math.floor(Math.random() * 7)];
    
    onlineUsers[socket.id] = {
        username: username,
        avatarColor: avatarColor,
        avatarImage: null,
        bannerImage: null,
        status: 'online',
        customStatus: ''
    };
    
    socket.emit('user data', {
        userId: socket.id,
        username: username,
        avatarColor: avatarColor
    });
    
    // Отправляем историю сообщений новому пользователю
    socket.emit('message history', messageHistory);
    
    // Обновляем онлайн
    io.emit('online count', Object.keys(onlineUsers).length);
    io.emit('online users', onlineUsers);
    
    console.log(`👤 ${username} зашел. Онлайн: ${Object.keys(onlineUsers).length}`);

    // ===== СООБЩЕНИЯ =====
    socket.on('chat message', (data) => {
        const user = onlineUsers[socket.id];
        if (!user) return;
        
        const messageData = {
            type: data.type || 'text',
            text: data.text || '',
            url: data.url || null,
            name: data.name || null,
            size: data.size || null,
            username: user.username,
            avatarColor: user.avatarColor,
            avatarImage: user.avatarImage || null,
            userId: socket.id,
            timestamp: new Date().toISOString()
        };
        
        // Сохраняем в историю
        messageHistory.push(messageData);
        if (messageHistory.length > MAX_HISTORY) {
            messageHistory.shift();
        }
        
        // Отправляем всем
        io.emit('chat message', messageData);
    });

    // ===== ПРОФИЛЬ =====
    socket.on('update profile', (data) => {
        if (onlineUsers[socket.id]) {
            const oldUsername = onlineUsers[socket.id].username;
            onlineUsers[socket.id].username = data.username || onlineUsers[socket.id].username;
            onlineUsers[socket.id].avatarColor = data.avatarColor || onlineUsers[socket.id].avatarColor;
            onlineUsers[socket.id].avatarImage = data.avatarImage || onlineUsers[socket.id].avatarImage;
            onlineUsers[socket.id].bannerImage = data.bannerImage || onlineUsers[socket.id].bannerImage;
            onlineUsers[socket.id].status = data.status || onlineUsers[socket.id].status;
            onlineUsers[socket.id].customStatus = data.customStatus || onlineUsers[socket.id].customStatus;
            
            // Обновляем историю сообщений с новым ником
            messageHistory = messageHistory.map(msg => {
                if (msg.userId === socket.id) {
                    return { ...msg, username: onlineUsers[socket.id].username };
                }
                return msg;
            });
            
            io.emit('user updated', {
                userId: socket.id,
                username: onlineUsers[socket.id].username,
                avatarColor: onlineUsers[socket.id].avatarColor,
                avatarImage: onlineUsers[socket.id].avatarImage,
                bannerImage: onlineUsers[socket.id].bannerImage,
                status: onlineUsers[socket.id].status,
                customStatus: onlineUsers[socket.id].customStatus
            });
            
            socket.emit('profile saved', { success: true });
        }
    });

    // ===== КЕЙС =====
    socket.on('open case', () => {
        const random = Math.random();
        let filteredItems;
        if (random < 0.5) {
            filteredItems = caseItems.filter(item => item.rarity === 'Обычный');
        } else if (random < 0.8) {
            filteredItems = caseItems.filter(item => item.rarity === 'Редкий');
        } else if (random < 0.95) {
            filteredItems = caseItems.filter(item => item.rarity === 'Легендарный');
        } else {
            filteredItems = caseItems.filter(item => item.rarity === 'Мифический');
        }
        const prize = filteredItems[Math.floor(Math.random() * filteredItems.length)];
        socket.emit('case result', prize);
    });

    // ===== ПЕЧАТАЕТ =====
    socket.on('typing', (username) => {
        socket.broadcast.emit('typing', username);
    });

    // ===== ОТКЛЮЧЕНИЕ =====
    socket.on('disconnect', () => {
        const user = onlineUsers[socket.id];
        delete onlineUsers[socket.id];
        io.emit('online count', Object.keys(onlineUsers).length);
        io.emit('online users', onlineUsers);
        console.log(`👋 ${user?.username || 'Пользователь'} вышел. Онлайн: ${Object.keys(onlineUsers).length}`);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});