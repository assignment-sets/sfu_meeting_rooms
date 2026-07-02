// backend/server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mediasoup from 'mediasoup';
import { config } from './config.js';
import { initializeSocketSignaling } from './socket-manager.js';
import { requireAuth } from './middleware/auth.middleware.js';
import dotenv from 'dotenv';
import cors from 'cors';
import { connectDB } from './lib/mongodb.js';
import { Room } from './models/Room.js';

dotenv.config();

export const activeRouters = new Map();


const app = express();
const httpServer = createServer(app);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Essential middleware for your express REST endpoints to read JSON bodies
app.use(express.json());

// Allow CORS from your Vite dev server (usually http://localhost:5173)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT;

// MediaSoup global worker placeholder (we no longer need a global router placeholder)
let mediasoupWorker;

const createWorker = async () => {
  mediasoupWorker = await mediasoup.createWorker({
    logLevel: config.worker.logLevel,
    logTags: config.worker.logTags,
    rtcMinPort: config.worker.rtcMinPort,
    rtcMaxPort: config.worker.rtcMaxPort,
  });

  mediasoupWorker.on('died', (error) => {
    console.error('mediasoup Worker died, exiting...', error);
    setTimeout(() => process.exit(1), 2000);
  });

  console.log(`MediaSoup Worker created [pid:${mediasoupWorker.pid}]`);
  return mediasoupWorker;
};

// ==========================================================
// DYNAMIC ROUTER ROOM CREATION
// ==========================================================
app.post('/api/rooms/create', requireAuth, async (req, res) => {
  try {
    const hostUserId = req.user.userId;
    const roomId = crypto.randomUUID();

    // 1. Spawning a completely isolated C++ Router instance specifically for THIS room
    const roomRouter = await mediasoupWorker.createRouter({
      mediaCodecs: config.router.mediaCodecs,
    });

    // 2. Cache the live C++ router instance using the unique roomId as the key
    activeRouters.set(roomId, roomRouter);

    console.log(`[MediaSoup] Fresh isolated Router (${roomRouter.id}) spawned for Room: ${roomId}`);

    // 3. Save the room and the explicit router ID to MongoDB
    const newRoom = await Room.create({
      roomId,
      hostUserId,
      mediasoupRouterId: roomRouter.id,
      members: []
    });

    const inviteLink = `http://localhost:5173/room/${roomId}?active=true`;

    return res.status(201).json({
      success: true,
      message: 'Isolated room generated successfully.',
      roomId: newRoom.roomId,
      inviteLink
    });

  } catch (error) {
    console.error('[HTTP Error] Failed to create room:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ------------------------------------------------------------------
// TEST REST ENDPOINT
// ------------------------------------------------------------------
app.post('/api/test', requireAuth, (req, res) => {
  // Logs the user payload safely to your console
  console.log('--- Authenticated User Request ---');
  console.log(req.user);
  console.log('---------------------------------');

  res.status(200).json({
    message: 'Authentication successful!',
    user: req.user
  });
});


// Update startApp to remove the global router initialization
const startApp = async () => {
  try {
    await connectDB();

    // Just create the worker process on startup
    await createWorker();

    // Initialize signaling, passing the global io instance
    initializeSocketSignaling(io);

    httpServer.listen(PORT, () => {
      console.log(`HTTP Signaling server listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Boot crash:', error);
    process.exit(1);
  }
};

startApp();