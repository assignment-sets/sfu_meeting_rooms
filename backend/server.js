// backend/server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mediasoup from 'mediasoup';
import { config } from './config.js';
import { initializeSocketSignaling } from './socket-manager.js';

const app = express();
const httpServer = createServer(app);

// Allow CORS from your Vite dev server (usually http://localhost:5173)
const io = new Server(httpServer, {
  cors: {
    origin: '*', 
    methods: ['GET', 'POST']
  }
});

const PORT = 3000;

// MediaSoup global state placeholder
let mediasoupWorker;
let mediasoupRouter;

// Initialize MediaSoup Worker
const createWorker = async () => {
  mediasoupWorker = await mediasoup.createWorker({
    logLevel: config.worker.logLevel,
    logTags: config.worker.logTags,
    rtcMinPort: config.worker.rtcMinPort,
    rtcMaxPort: config.worker.rtcMaxPort,
  });

  mediasoupWorker.on('died', (error) => {
    console.error('mediasoup Worker died, exiting in 2 seconds...', error);
    setTimeout(() => process.exit(1), 2000);
  });

  console.log(`MediaSoup Worker created [pid:${mediasoupWorker.pid}]`);
  return mediasoupWorker;
};

// Start Server
const startApp = async () => {
  const worker = await createWorker();

  mediasoupRouter = await worker.createRouter({
    mediaCodecs: config.router.mediaCodecs,
  });
  console.log('MediaSoup Router created successfully.');
  
  // Pass the router instance into your signaling layer
  initializeSocketSignaling(io, { mediasoupRouter });

  httpServer.listen(PORT, () => {
    console.log(`HTTP Signaling server listening on http://localhost:${PORT}`);
    console.log(`👉 Point your ngrok / Cloudflare tunnel to port ${PORT}`);
  });
};

startApp();
