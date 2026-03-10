const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// --- STATE MANAGEMENT ---
let tiktokConnection;
let playerTeams = {}; 
let likeCounters = {}; 
let teamRosters = { red: [], blue: [], green: [], white: [] }; 
let processedFollowers = new Set(); 

const teamMap = { 'r': 'red', 'b': 'blue', 'g': 'green', 'w': 'white' };
const teams = ['red', 'blue', 'green', 'white'];

io.on('connection', (socket) => {
    console.log('🌐 Browser UI connected');

    socket.on('set-username', (username) => {
        console.log(`🔗 Connecting to TikTok user: ${username}`);
        
        if (tiktokConnection) {
            tiktokConnection.disconnect();
        }

        // --- UPDATED FOR EULERSTREAM API ---
        tiktokConnection = new WebcastPushConnection(username, {
            enableExtendedGiftInfo: true,
            signProviderOptions: {
                params: {
                    apiKey: "euler_YzA1YThiNWM0ZDgzNWI5NDQxNGVjOTRjMGMyNThiNjhmMDE4NDdlOTJhODllMmZjZjM0MjFl"
                }
            }
        });

        tiktokConnection.connect().then(() => {
            console.info(`✅ Successfully connected to: ${username}`);
        }).catch(err => {
            console.error('❌ TikTok Connection Error:', err.message);
        });

        setupTikTokEvents(tiktokConnection);
    });
});

function setupTikTokEvents(connection) {
    // 1. JOIN TEAM SYSTEM
    connection.on('chat', (data) => {
        const comment = data.comment.toLowerCase().trim();
        const uID = data.uniqueId;
        const pPic = data.profilePictureUrl;

        if (!playerTeams[uID] && teamMap[comment]) {
            const selectedTeam = teamMap[comment];
            playerTeams[uID] = selectedTeam;
            teamRosters[selectedTeam].push(pPic);
            io.emit('dropBall', { team: selectedTeam, count: 1, user: uID, pfp: pPic });
        }
    });

    // 2. LIKE SYSTEM
    connection.on('like', (data) => {
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
    connection.on('follow', (data) => {
        const uID = data.uniqueId;
        if (processedFollowers.has(uID)) return;

        let targetTeam = playerTeams[uID] || teams[Math.floor(Math.random() * teams.length)];
        processedFollowers.add(uID);
        io.emit('dropBall', { team: targetTeam, count: 5, user: uID, pfp: data.profilePictureUrl });
    });

    // 4. GIFT SYSTEM
    connection.on('gift', (data) => {
        const uID = data.uniqueId;
        const giftName = data.giftName.toLowerCase();
        let targetTeam = null;

        if (giftName === 'rose') targetTeam = 'red';
        else if (giftName === 'gg') targetTeam = 'blue';
        else if (giftName.includes('heart me')) targetTeam = 'green';
        else if (giftName === 'ice cream') targetTeam = 'white';

        if (targetTeam) {
            io.emit('dropBall', { team: targetTeam, count: 20, user: uID, pfp: data.profilePictureUrl });
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
