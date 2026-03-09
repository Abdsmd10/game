const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURATION ---
const TIKTOK_USERNAME = "ivosh77"; 
let tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME);

app.use(express.static(__dirname));

// --- STATE MANAGEMENT ---
let playerTeams = {}; 
let likeCounters = {}; 
let teamRosters = { red: [], blue: [], green: [], white: [] }; 
let processedFollowers = new Set(); 

const teamMap = { 'r': 'red', 'b': 'blue', 'g': 'green', 'w': 'white' };
const teams = ['red', 'blue', 'green', 'white'];

// Connect to TikTok
tiktokConnection.connect().then(() => {
    console.info(`✅ Connected to TikTok: ${TIKTOK_USERNAME}`);
}).catch(err => console.error('❌ Connection Error:', err.message));

// 1. JOIN TEAM SYSTEM (Comment to join, drops 1 ball)
tiktokConnection.on('chat', (data) => {
    const comment = data.comment.toLowerCase().trim();
    const uID = data.uniqueId;
    const pPic = data.profilePictureUrl;

    if (!playerTeams[uID] && teamMap[comment]) {
        const selectedTeam = teamMap[comment];
        playerTeams[uID] = selectedTeam;
        
        teamRosters[selectedTeam].push(pPic);
        console.log(`✨ ${uID} joined Team ${selectedTeam.toUpperCase()}`);
        
        io.emit('dropBall', { team: selectedTeam, count: 1, user: uID, pfp: pPic });
        io.emit('updateRoster', { team: selectedTeam, roster: teamRosters[selectedTeam] });
    }
});

// 2. LIKE SYSTEM (15 likes = 5 balls)
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

// 3. FOLLOWER SYSTEM (5 balls)
tiktokConnection.on('follow', (data) => {
    const uID = data.uniqueId;
    if (processedFollowers.has(uID)) return; // Prevent spam

    let targetTeam;
    if (playerTeams[uID]) {
        // Follow after comment
        targetTeam = playerTeams[uID];
        console.log(`👤 ${uID} followed after joining! Dropping 5 balls for ${targetTeam}.`);
    } else {
        // Follow before comment (Random team)
        targetTeam = teams[Math.floor(Math.random() * teams.length)];
        console.log(`👤 ${uID} followed before joining! Random drop: 5 balls for ${targetTeam}.`);
    }

    processedFollowers.add(uID);
    io.emit('dropBall', { team: targetTeam, count: 5, user: uID, pfp: data.profilePictureUrl });
});

// 4. GIFT SYSTEM (Specific gifts for specific teams)
tiktokConnection.on('gift', (data) => {
    const uID = data.uniqueId;
    const giftName = data.giftName.toLowerCase();
    let targetTeam = null;

    // Check gift type to determine team
    if (giftName === 'rose') {
        targetTeam = 'red';
    } else if (giftName === 'gg') {
        targetTeam = 'blue';
    } else if (giftName.includes('heart me')) {
        targetTeam = 'green';
    } else if (giftName === 'ice cream') {
        targetTeam = 'white';
    }

    if (targetTeam) {
        console.log(`🎁 ${uID} sent ${giftName}! Dropping 20 balls for ${targetTeam}.`);
        io.emit('dropBall', { 
            team: targetTeam, 
            count: 20, 
            user: uID, 
            pfp: data.profilePictureUrl 
        });
    }
});

server.listen(3000, () => {
    console.log('🚀 Server running: http://localhost:3000');
});
