const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection, SignConfig } = require('tiktok-live-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURATION ---
SignConfig.apiKey = "euler_YzA1YThiNWM0ZDgzNWI5NDQxNGVjOTRjMGMyNThiNjhmMDE4NDdlOTJhODllMmZjZjM0MjFl";
let TIKTOK_USERNAME = ""; // Set via UI

app.use(express.static(__dirname));

// --- STATE MANAGEMENT ---
let tiktokConnection;
let playerTeams = {}; 
let likeCounters = {}; 
let processedFollowers = new Set(); 

const teamMap = { 'r': 'red', 'b': 'blue', 'g': 'green', 'w': 'white' };
const teams = ['red', 'blue', 'green', 'white'];

// --- RECONNECTION LOGIC ---
function connectToTikTok() {
    if (!TIKTOK_USERNAME) {
        console.log("⏳ Waiting for username from UI...");
        return;
    }

    if (tiktokConnection) {
        tiktokConnection.disconnect();
    }
    
    console.log(`🔗 Attempting to connect: ${TIKTOK_USERNAME}`);
    
    tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME, {
        processInitialData: false,
        enableExtendedGiftInfo: true,
        requestPollingIntervalMs: 2000 
    });

    tiktokConnection.connect().then(state => {
        console.log(`✅ Connected to Room ID: ${state.roomId}`);
    }).catch(err => {
        console.error('❌ Connection Failed. Retrying in 10s...', err);
        setTimeout(connectToTikTok, 10000); 
    });

    tiktokConnection.on('disconnected', () => {
        console.log('⚠️ TikTok Disconnected! Reconnecting...');
        setTimeout(connectToTikTok, 5000);
    });

    tiktokConnection.on('streamEnd', () => {
        console.log('🛑 Stream ended by creator.');
        setTimeout(connectToTikTok, 30000); 
    });

    tiktokConnection.on('error', (err) => {
        console.error('❌ TikTok Error:', err);
    });

    // 1. JOIN SYSTEM (Chat)
    tiktokConnection.on('chat', (data) => {
        const msg = data.comment.toLowerCase().trim();
        const uID = data.uniqueId;
        if (teamMap[msg]) {
            const newTeam = teamMap[msg];
            const isSwitching = playerTeams[uID] && playerTeams[uID] !== newTeam;
            playerTeams[uID] = newTeam;
            io.emit('newPlayer', { user: uID, team: newTeam, pfp: data.profilePictureUrl, isSwitching });
        }
    });

    // 2. LIKE SYSTEM
    tiktokConnection.on('like', (data) => {
        const uID = data.uniqueId;
        if (playerTeams[uID]) {
            likeCounters[uID] = (likeCounters[uID] || 0) + data.likeCount;
            if (likeCounters[uID] >= 15) {
                const dropCount = Math.floor(likeCounters[uID] / 15) * 5;
                io.emit('dropBall', { team: playerTeams[uID], count: dropCount, user: uID, pfp: data.profilePictureUrl });
                likeCounters[uID] %= 15;
            }
        }
    });

    // 3. FOLLOWER SYSTEM
    tiktokConnection.on('follow', (data) => {
        const uID = data.uniqueId;
        if (processedFollowers.has(uID)) return;
        let targetTeam = playerTeams[uID] || teams[Math.floor(Math.random() * teams.length)];
        processedFollowers.add(uID);
        io.emit('dropBall', { team: targetTeam, count: 5, user: uID, pfp: data.profilePictureUrl });
    });

    // 4. GIFT SYSTEM
    tiktokConnection.on('gift', (data) => {
        const uID = data.uniqueId;
        const giftName = data.giftName.toLowerCase();
        let targetTeam = null;
        if (giftName === 'rose') targetTeam = 'red';
        else if (giftName === 'tiktok') targetTeam = 'blue';
        else if (giftName.includes('heart me')) targetTeam = 'green';
        else if (giftName === 'gg') targetTeam = 'white';
        if (targetTeam) {
            io.emit('dropBall', { team: targetTeam, count: 10, user: uID, pfp: data.profilePictureUrl });
        }
    });
}

io.on('connection', (socket) => {
    socket.on('updateUsername', (newUsername) => {
        TIKTOK_USERNAME = newUsername;
        connectToTikTok();
    });
});

connectToTikTok();

// --- PREVENT RENDER SLEEP ---
setInterval(() => {
    http.get(`http://localhost:${PORT}/`, (res) => {
        console.log('Keep-alive ping sent');
    });
}, 300000); 

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
