// backend/socket-manager.js
import { config } from './config.js';

// In-memory store mapping transport IDs to their instances
const transports = new Map();
const producers = new Map();
const consumers = new Map();

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

    // DTLS handshake handler
    handleEvent('connectWebRtcTransport', async (data) => {
      const { transportId, dtlsParameters } = data;
      const transport = transports.get(transportId);

      if (!transport) {
        throw new Error(`Server-side transport with ID ${transportId} not found.`);
      }

      // Secure the connection by linking DTLS parameters
      await transport.connect({ dtlsParameters });
      console.log(`[MediaSoup] Transport ${transportId} successfully connected to DTLS.`);
      return true;
    });
    // create mediasoup mediaProducer on server event handler
    handleEvent('produceMediaStream', async (data) => {
      const { transportId, kind, rtpParameters } = data;
      const transport = transports.get(transportId);
      if (!transport) throw new Error('Transport not found');

      // Instruct server transport to start receiving this RTP stream blueprint
      const producer = await transport.produce({
        kind,
        rtpParameters,
      });

      // Keep reference to track state
      producers.set(producer.id, producer);

      console.log(`[MediaSoup] Server Producer active! ID: ${producer.id} [Kind: ${kind}]`);

      producer.on('transportclose', () => {
        console.log(`[MediaSoup] Producer parent transport closed. Killing producer: ${producer.id}`);
        producer.close();
        producers.delete(producer.id);
      });

      // Pass the real generated ID back down to the client
      return { id: producer.id };
    });

    handleEvent('createRecvTransport', async () => {
      // Allocate another distinct WebRtcTransport instance from the router
      const transport = await createMediaSoupWebRtcTransport(mediasoupRouter);
      
      // Store reference in our existing global map
      transports.set(transport.id, transport);
      
      console.log(`[MediaSoup] Server Receive Transport created: ${transport.id}`);
      
      // Return the credentials so the client device can hook onto it
      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
    });

    handleEvent('consumeMediaStream', async (data) => {
      const { transportId, producerId, rtpCapabilities } = data;

      // 1. Find the receive transport we made in the previous sprint
      const transport = transports.get(transportId);
      if (!transport) throw new Error('Receive transport not found');

      // 2. Check if the router can route this specific producer to this specific browser
      const canConsume = mediasoupRouter.canConsume({ producerId, rtpCapabilities });
      if (!canConsume) {
        throw new Error(`Cannot consume producer ${producerId} with provided RTP capabilities`);
      }

      // 3. Create the server-side Consumer instance on our receive transport
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true, // Crucial: MediaSoup forces consumers to start paused for sync safety
      });

      // 4. Store the consumer instance reference
      consumers.set(consumer.id, consumer);
      console.log(`[MediaSoup] Server Consumer allocated! ID: ${consumer.id} [Kind: ${consumer.kind}]`);

      consumer.on('transportclose', () => {
        consumer.close();
        consumers.delete(consumer.id);
      });

      // 5. Send parameters down so client-side device engine can map the track
      return {
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      };
    });

    handleEvent('resumeConsumer', async (data) => {
      const { consumerId } = data;
      const consumer = consumers.get(consumerId);

      if (!consumer) {
        throw new Error(`Server-side Consumer with ID ${consumerId} not found.`);
      }

      // Unfreeze the RTP packet pipe
      await consumer.resume();
      console.log(`[MediaSoup] Consumer ${consumerId} resumed. Packets are now flowing.`);
      return true;
    });

    socket.on('disconnect', () => {
      console.log(`[Signaling] Client disconnected: ${socket.id}`);
    });
  });
};
