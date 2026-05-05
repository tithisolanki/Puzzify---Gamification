const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for dev
    methods: ["GET", "POST"]
  }
});

// Segmented matchmaking pools
const waitingPools = {
  Easy: null,
  Medium: null,
  Hard: null,
  Random: null
};

// Active private rooms map
const privateRooms = {}; // { roomCode: { host, guest, settings, roleFlip } }

function getDefaultRoomSettings() {
  return {
    difficulty: "Medium",
    timeLimit: -1, // -1 means default
    mode: "normal", // normal | fog | solver_saboteur
    liveCaptureEnabled: false
  };
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // --- PUBLIC MATCHMAKING ---
  socket.on('join_matchmaking', (data) => {
    const requestedLevel = data.level; // "Easy", "Medium", "Hard", or "Random"
    
    // Safety check
    if (!waitingPools.hasOwnProperty(requestedLevel)) return;

    if (waitingPools[requestedLevel] && waitingPools[requestedLevel].socket.id !== socket.id) {
      // Match found
      const waitingPlayer = waitingPools[requestedLevel];
      const roomName = `room_public_${waitingPlayer.socket.id}_${socket.id}`;
      
      socket.join(roomName);
      waitingPlayer.socket.join(roomName);
      
      const seed = Math.floor(Math.random() * 100000);
      
      // Determine actual level if queue was Random
      let actualLevel = requestedLevel;
      if (requestedLevel === 'Random') {
        const levels = ["Easy", "Medium", "Hard"];
        actualLevel = levels[Math.floor(Math.random() * levels.length)];
      }
      
      io.to(roomName).emit('match_found', {
        room: roomName,
        seed: seed,
        level: actualLevel,
        timeLimit: null // Use default
      });
      
      console.log(`Public match created: ${roomName} (${actualLevel})`);
      waitingPools[requestedLevel] = null;
    } else {
      // Enter queue
      waitingPools[requestedLevel] = { socket, level: requestedLevel };
      socket.emit('waiting_for_opponent');
    }
  });

  // --- PRIVATE ROOMS ---
  socket.on('create_private_room', () => {
    const code = generateRoomCode();
    const roomName = `room_private_${code}`;
    
    socket.join(roomName);
    privateRooms[code] = {
      roomName,
      host: socket.id,
      guest: null,
      settings: getDefaultRoomSettings(),
      lastSolverId: null
    };

    socket.emit('room_created', { code, settings: privateRooms[code].settings });
    console.log(`Private room created: ${code}`);
  });

  socket.on('join_private_room', (data) => {
    const { code } = data;
    const roomInfo = privateRooms[code];
    
    if (roomInfo && !roomInfo.guest && roomInfo.host !== socket.id) {
      socket.join(roomInfo.roomName);
      roomInfo.guest = socket.id;
      
      socket.emit('room_joined_success', { code, settings: roomInfo.settings });
      // Notify host
      socket.to(roomInfo.roomName).emit('guest_joined');
      console.log(`User joined private room: ${code}`);
    } else {
      socket.emit('room_join_failed', { message: "Invalid room code or room is full." });
    }
  });

  socket.on('update_room_settings', (data) => {
    const { code, settings } = data;
    const roomInfo = privateRooms[code];
    if (roomInfo && roomInfo.host === socket.id) {
      roomInfo.settings = { ...roomInfo.settings, ...settings };
      // Broadcast to everyone in room including host
      io.to(roomInfo.roomName).emit('settings_updated', roomInfo.settings);
    }
  });

  socket.on('start_private_game', (data) => {
    const { code } = data;
    const roomInfo = privateRooms[code];
    if (roomInfo && roomInfo.host === socket.id && roomInfo.guest) {
      const seed = Math.floor(Math.random() * 100000);
      const mode = roomInfo.settings.mode || "normal";
      let hostRole = "solver";
      let guestRole = "solver";
      if (mode === "solver_saboteur") {
        // First round is random. Every next round swaps roles.
        if (!roomInfo.lastSolverId) {
          const randomSolver = Math.random() > 0.5 ? roomInfo.host : roomInfo.guest;
          roomInfo.lastSolverId = randomSolver;
        } else {
          roomInfo.lastSolverId = roomInfo.lastSolverId === roomInfo.host ? roomInfo.guest : roomInfo.host;
        }
        hostRole = roomInfo.lastSolverId === roomInfo.host ? "solver" : "saboteur";
        guestRole = roomInfo.lastSolverId === roomInfo.guest ? "solver" : "saboteur";
      }

      io.to(roomInfo.roomName).emit('match_found', {
        room: roomInfo.roomName,
        seed: seed,
        level: roomInfo.settings.difficulty,
        timeLimit: mode === "solver_saboteur" ? -1 : roomInfo.settings.timeLimit,
        mode,
        roles: {
          [roomInfo.host]: hostRole,
          [roomInfo.guest]: guestRole
        },
        liveCaptureEnabled: !!roomInfo.settings.liveCaptureEnabled
      });
      console.log(`Private match started: ${code}`);
    }
  });

  // --- IN-GAME EVENTS ---
  socket.on('progress_update', (data) => {
    socket.to(data.room).emit('opponent_progress', {
      progress: data.progress,
      matchedIndices: data.matchedIndices || [],
      status: data.status || "solving",
      tileSnapshot: data.tileSnapshot || null
    });
  });

  socket.on('send_interference', (data) => {
    socket.to(data.room).emit('receive_interference', {
      type: data.type,
      durationMs: data.durationMs || 2500,
      intensity: data.intensity || "light"
    });
  });

  socket.on('send_sabotage_action', (data) => {
    socket.to(data.room).emit('receive_sabotage_action', {
      actionType: data.actionType,
      payload: data.payload || null
    });
  });

  socket.on('send_powerup_action', (data) => {
    socket.to(data.room).emit('receive_powerup_action', {
      actionType: data.actionType,
      payload: data.payload || null
    });
  });

  socket.on('send_video_frame', (data) => {
    socket.to(data.room).emit('receive_video_frame', {
      frameDataUrl: data.frameDataUrl,
      sentAt: Date.now()
    });
  });
  
  socket.on('game_won', (data) => {
    socket.to(data.room).emit('opponent_won');
  });

  // --- CLEANUP ---
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove from matchmaking pools
    for (const key in waitingPools) {
      if (waitingPools[key] && waitingPools[key].socket.id === socket.id) {
        waitingPools[key] = null;
      }
    }
    // Handle private rooms logic if needed
    for (const code in privateRooms) {
      const room = privateRooms[code];
      if (room.host === socket.id) {
        // Host left, room is dead
        socket.to(room.roomName).emit('room_join_failed', { message: "Host left the room." });
        delete privateRooms[code];
      } else if (room.guest === socket.id) {
        room.guest = null;
        socket.to(room.roomName).emit('guest_left');
      }
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
