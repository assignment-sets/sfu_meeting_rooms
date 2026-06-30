// backend/socket-manager.js
import { config } from './config.js';

// In-memory store mapping transport IDs to their instances
const transports = new Map();

// Helper to create a WebRtcTransport on the server router
const createMediaSoupWebRtcTransport = async (router) => {
  const { listenInfos, initialAvailableOutgoingBitrate } = config.webRtcTransport;

  const transport = await router.createWebRtcTransport({
    listenInfos,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate,
  });

  // Handle production optimization/cleanup events
  transport.on('dtlsstatechange', (dtlsState) => {
    if (dtlsState === 'closed') {
      console.log(`[MediaSoup] Transport ${transport.id} DTLS closed.`);
      transport.close();
      transports.delete(transport.id);
    }
  });

  transport.on('@close', () => {
    console.log(`[MediaSoup] Transport ${transport.id} closed.`);
    transports.delete(transport.id);
  });

  return transport;
};

export const initializeSocketSignaling = (io, { mediasoupRouter }) => {
  io.on('connection', (socket) => {
    console.log(`[Signaling] Client connected: ${socket.id}`);

    // Standard signaling error handler wrapper
    const handleEvent = (eventName, handler) => {
      socket.on(eventName, async (data, callback) => {
        try {
          console.log(`[Signaling] Received event: ${eventName} from ${socket.id}`);
          const result = await handler(data, socket);
          // Return success response to the client
          if (callback) callback({ success: true, data: result });
        } catch (error) {
          console.error(`[Signaling Error] Event ${eventName} failed:`, error.message);
          if (callback) callback({ success: false, error: error.message });
        }
      });
    };

    // get router capabilities handler
    handleEvent('getRouterRtpCapabilities', async () => {
      return mediasoupRouter.rtpCapabilities;
    });

    // get transport params handler
    handleEvent('createWebRtcTransport', async (data, clientSocket) => {
      const transport = await createMediaSoupWebRtcTransport(mediasoupRouter);
      
      // Store reference using unique ID
      transports.set(transport.id, transport);

      console.log(`[MediaSoup] Server Send Transport created: ${transport.id}`);

      // Extract parameters required by client-side Device to bind
      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
    });

    socket.on('disconnect', () => {
      console.log(`[Signaling] Client disconnected: ${socket.id}`);
    });
  });
};
