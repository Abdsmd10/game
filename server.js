const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// CHANGE TO YOUR TIKTOK USERNAME
const TIKTOK_USERNAME = "yosoyrickclash";

let tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME, {
    processInitialData: true,
    enableWebsocketUpgrade: true,
    requestOptions: {
        timeout: 10000
    }
});

app.use(express.static(__dirname));

let playerTeams = {};
let teamRosters = { red: [], blue: [], green: [], white: [] };
let rewardedFollowers = new Set();
let userLikes = {};

// NEW: Data structures for the podium
let individualScores = {}; 
let userPfps = {}; 

const teamMap = {
    r:'red', b:'blue', g:'green', w:'white',
    red:'red', blue:'blue', green:'green', white:'white'
};

io.on('connection',(socket)=>{
    console.log("🌐 Dashboard connected");
    // Send current podium state on join
    updatePodium();

    socket.on('resetRoundScores', () => {
        individualScores = {};
        userPfps = {};
        updatePodium();
    });
});

// Logic to calculate top 3 and emit to HTML
function updatePodium() {
    const topThree = Object.entries(individualScores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([username, score]) => ({
            username: username,
            score: score,
            pfp: userPfps[username] // This sends the URL to index.html
        }));
    
    io.emit('updatePodium', topThree);
}

function connectTikTok(){
    console.log(`📡 Attempting to connect to ${TIKTOK_USERNAME}...`);
    tiktokConnection.connect().then(state=>{
        console.log("✅ Connected to TikTok Room:", state.roomId);
    }).catch(err=>{
        console.log("❌ TikTok connection failed. Retrying in 10s...");
        setTimeout(connectTikTok, 10000);
    });
}

connectTikTok();

tiktokConnection.on('chat',(data)=>{
    const comment = data.comment.toLowerCase().trim();
    
    // Always store/update PFP for the podium
    userPfps[data.uniqueId] = data.profilePictureUrl;

    if(teamMap[comment]){
        const team = teamMap[comment];
        playerTeams[data.uniqueId] = team;
        
        teamRosters[team].unshift(data.uniqueId);
        if(teamRosters[team].length > 5) teamRosters[team].pop();

        // Increment individual score for the podium
        individualScores[data.uniqueId] = (individualScores[data.uniqueId] || 0) + 1;

        io.emit('dropBall',{team:team,count:1});
        io.emit('updateRoster',{team:team,roster:teamRosters[team]});
        updatePodium();
    }
});

tiktokConnection.on('follow',(data)=>{
    const team = playerTeams[data.uniqueId];
    userPfps[data.uniqueId] = data.profilePictureUrl;

    if(team && !rewardedFollowers.has(data.uniqueId)){
        rewardedFollowers.add(data.uniqueId);
        individualScores[data.uniqueId] = (individualScores[data.uniqueId] || 0) + 10;
        io.emit('dropBall',{team:team,count:10});
        updatePodium();
    }
});

tiktokConnection.on('like',(data)=>{
    const team = playerTeams[data.uniqueId];
    userPfps[data.uniqueId] = data.profilePictureUrl;

    if(team){
        userLikes[data.uniqueId] = (userLikes[data.uniqueId] || 0) + data.likeCount;
        if(userLikes[data.uniqueId] >= 10){
            userLikes[data.uniqueId] -= 10;
            individualScores[data.uniqueId] = (individualScores[data.uniqueId] || 0) + 5;
            io.emit('dropBall',{team:team,count:5});
            updatePodium();
        }
    }
});

server.listen(3000,()=> console.log("🚀 Server running http://localhost:3000"));