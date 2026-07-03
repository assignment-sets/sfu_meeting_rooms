// backend/socket-manager.js
import { config } from './config.js';
import { Room } from './models/Room.js';
import { clerkClient } from './lib/clerk.js';
import { activeRouters } from './server.js';

// Live C++ engine allocation mappings held entirely in server memory
const transports = new Map();
const producers = new Map();
const consumers = new Map();

const createMediaSoupWebRtcTransport = async (router) => {
  const { listenInfos, initialAvailableOutgoingBitrate } = config.webRtcTransport;
  const transport = await router.createWebRtcTransport({
    listenInfos,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate,
  });

  transport.on('dtlsstatechange', (dtlsState) => {
    if (dtlsState === 'closed') {
      transport.close();
      transports.delete(transport.id);
    }
  });

  transport.on('@close', () => {
    transports.delete(transport.id);
  });

  return transport;
};

export const initializeSocketSignaling = (io) => {

  // Auth Middleware (Clerk Handshake Verification)
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers['authorization'];
      if (!token) return next(new Error('Authentication failure: Missing token.'));
      const cleanToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;
      const dummyReq = new Request('http://localhost/socket', {
        headers: new Headers({ 'Authorization': `Bearer ${cleanToken}` })
      });
      const requestState = await clerkClient.authenticateRequest(dummyReq, {
        publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      if (!requestState.isAuthenticated) return next(new Error('Authentication failure.'));

      // Bind Clerk Identity safely to the Node runtime socket layer instance
      socket.userId = requestState.toAuth().userId;
      next();
    } catch (err) {
      console.error(err);
      next(new Error('Internal auth error.'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Signaling] Connected: ${socket.id} (${socket.userId})`);

    const getRoomRouter = (clientSocket) => {
      const roomId = clientSocket.currentRoomId;
      if (!roomId) throw new Error('Socket not associated with a room.');
      const router = activeRouters.get(roomId);
      if (!router) throw new Error(`Router for room ${roomId} is dead.`);
      return router;
    };

    const handleEvent = (eventName, handler) => {
      socket.on(eventName, async (data, callback) => {
        try {
          const result = await handler(data, socket);
          if (callback) callback({ success: true, data: result });
        } catch (error) {
          console.error(`[Error] ${eventName}:`, error.message);
          if (callback) callback({ success: false, error: error.message });
        }
      });
    };

    handleEvent('getRouterRtpCapabilities', async (data, clientSocket) => {
      const roomRouter = getRoomRouter(clientSocket);
      return roomRouter.rtpCapabilities;
    });

    // ==================================================================
    // 1. JOIN ROOM (PERSISTENT HISTORICAL INGRESS LOG)
    // ==================================================================
    handleEvent('joinRoom', async (data, clientSocket) => {
      const { roomId } = data;
      if (!roomId) throw new Error('Missing Room ID.');

      const targetRoom = await Room.findOne({ roomId });
      if (!targetRoom) throw new Error('Room not found.');

      // Clear any prior session reference for this explicit user to prevent duplicate cluster rows
      await Room.updateOne({ roomId }, { $pull: { members: { userId: clientSocket.userId } } });

      // Save user entry historically. If they rejoin later, this appends their brand new socket details cleanly
      const updatedState = await Room.findOneAndUpdate(
        { roomId },
        {
          $addToSet: {
            members: {
              socketId: clientSocket.id,
              userId: clientSocket.userId,
              sendTransportId: null,
              recvTransportId: null,
              videoProducerId: null,
              audioProducerId: null
            }
          }
        },
        { returnDocument: 'after' } // Cleared Mongoose deprecation warning
      );

      // Save routing coordinates directly inside server runtime memory context
      clientSocket.join(roomId);
      clientSocket.currentRoomId = roomId;

      // Notify existing peers
      clientSocket.to(roomId).emit('newPeerJoined', {
        userId: clientSocket.userId,
        socketId: clientSocket.id
      });

      console.log(`[Room Sync] User ${clientSocket.userId} logged historically into room: ${roomId}`);

      return {
        roomId,
        currentMembers: updatedState.members
      };
    });

    // ==================================================================
    // 2. CREATE SEND TRANSPORT
    // ==================================================================
    handleEvent('createWebRtcTransport', async (data, clientSocket) => {
      const { roomId } = data;
      if (!roomId || clientSocket.currentRoomId !== roomId) throw new Error('Boundary error.');

      const roomRouter = getRoomRouter(clientSocket);
      const transport = await createMediaSoupWebRtcTransport(roomRouter);

      // TAG FOR MEMORY CLEANUP: Store ownership metadata inside the C++ wrapper object
      transport.appData = { socketId: clientSocket.id, userId: clientSocket.userId };
      transports.set(transport.id, transport);

      await Room.updateOne(
        { roomId, "members.userId": clientSocket.userId },
        { $set: { "members.$.sendTransportId": transport.id } }
      );

      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
    });

    // ==================================================================
    // 3. SECURE DTLS HANDSHAKE
    // ==================================================================
    handleEvent('connectWebRtcTransport', async (data) => {
      const { transportId, dtlsParameters } = data;
      const transport = transports.get(transportId);
      if (!transport) throw new Error('Transport unallocated.');
      await transport.connect({ dtlsParameters });
      return true;
    });

    // ==================================================================
    // 4. PRODUCE STREAM TRAFFIC
    // ==================================================================
    handleEvent('produceMediaStream', async (data, clientSocket) => {
      const { transportId, kind, rtpParameters, roomId } = data;
      const transport = transports.get(transportId);
      if (!transport) throw new Error('Send transport pipeline dead.');

      const producer = await transport.produce({ kind, rtpParameters });

      // TAG FOR MEMORY CLEANUP: Store ownership metadata inside the producer instance
      producer.appData = { socketId: clientSocket.id, userId: clientSocket.userId };
      producers.set(producer.id, producer);

      const updateField = kind === 'video' ? "members.$.videoProducerId" : "members.$.audioProducerId";
      await Room.updateOne(
        { roomId, "members.userId": clientSocket.userId },
        { $set: { [updateField]: producer.id } }
      );

      clientSocket.to(roomId).emit('newProducerAvailable', {
        producerId: producer.id,
        userId: clientSocket.userId,
        kind
      });

      console.log(`[MediaSoup] Live Producer [${kind}] active: ${producer.id}`);

      producer.on('transportclose', () => {
        producer.close();
        producers.delete(producer.id);
      });

      return { id: producer.id };
    });

    // ==================================================================
    // 5. CREATE RECEIVE TRANSPORT
    // ==================================================================
    handleEvent('createRecvTransport', async (data, clientSocket) => {
      const { roomId } = data;
      if (!roomId || clientSocket.currentRoomId !== roomId) throw new Error('Boundary error.');

      const roomRouter = getRoomRouter(clientSocket);
      const transport = await createMediaSoupWebRtcTransport(roomRouter);

      // TAG FOR MEMORY CLEANUP: Store ownership metadata inside the receiver transport wrapper
      transport.appData = { socketId: clientSocket.id, userId: clientSocket.userId };
      transports.set(transport.id, transport);

      await Room.updateOne(
        { roomId, "members.userId": clientSocket.userId },
        { $set: { "members.$.recvTransportId": transport.id } }
      );

      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
    });

    // ==================================================================
    // 6. CONSUME STREAM TRAFFIC
    // ==================================================================
    handleEvent('consumeMediaStream', async (data, clientSocket) => {
      const { transportId, producerId, rtpCapabilities } = data;
      const transport = transports.get(transportId);
      if (!transport) throw new Error('Receive transport dead.');

      const roomRouter = getRoomRouter(clientSocket);
      const canConsume = roomRouter.canConsume({ producerId, rtpCapabilities });
      if (!canConsume) throw new Error('Codec capability match failed.');

      const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true });

      // TAG FOR MEMORY CLEANUP: Store ownership metadata inside the consumer tracking row
      consumer.appData = { socketId: clientSocket.id, userId: clientSocket.userId };
      consumers.set(consumer.id, consumer);

      consumer.on('transportclose', () => {
        consumer.close();
        consumers.delete(consumer.id);
      });

      return {
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      };
    });

    // ==================================================================
    // 7. UNFREEZE CONSUMPTION VALVE
    // ==================================================================
    handleEvent('resumeConsumer', async (data) => {
      const { consumerId } = data;
      const consumer = consumers.get(consumerId);
      if (!consumer) throw new Error('Consumer node missing.');
      await consumer.resume();
      return true;
    });

    // ==================================================================
    // 8. STOP STREAM TRAFFIC (STRATEGY 3 DYNAMIC TRACK TEARDOWN)
    // ==================================================================
    handleEvent('stopMediaStream', async (data, clientSocket) => {
      const { kind, roomId } = data;
      if (!roomId || clientSocket.currentRoomId !== roomId) throw new Error('Boundary error.');

      console.log(`[MediaSoup] User ${clientSocket.userId} toggled OFF their ${kind} stream.`);

      // 1. Locate and destroy the live C++ media pipe for this explicit track kind
      for (const [producerId, producer] of producers.entries()) {
        if (producer.appData?.socketId === clientSocket.id && producer.kind === kind) {
          producer.close();
          producers.delete(producerId);
          console.log(`[Cleanup] Purged active ${kind} producer from memory: ${producerId}`);
        }
      }

      // 2. Nullify the track ID in MongoDB so future newcomers don't attempt extraction
      const updateField = kind === 'video' ? "members.$.videoProducerId" : "members.$.audioProducerId";
      await Room.updateOne(
        { roomId, "members.userId": clientSocket.userId },
        { $set: { [updateField]: null } }
      );

      // 3. Broadcast the Strategy 3 teardown ping to all active room peers
      clientSocket.to(roomId).emit('peerStoppedProducer', {
        userId: clientSocket.userId,
        kind
      });

      return true;
    });

    // ==================================================================
    // 8. EFFICIENT IN-MEMORY DISCONNECTION PURGE + DB BLUEPRINT CLEANUP
    // ==================================================================
    socket.on('disconnect', async () => { // 🌟 Marked as async for Mongoose tracking
      const targetRoomId = socket.currentRoomId;
      const targetUserId = socket.userId;

      console.log(`[Signaling] Drop Out Detected: ${socket.id} (${targetUserId})`);

      if (targetRoomId) {
        console.log(`[MediaSoup Cleanup] Commencing rapid memory evacuation for User: ${targetUserId}`);

        // 1. Purge memory map references for Producers owned by this explicit socket
        for (const [producerId, producer] of producers.entries()) {
          if (producer.appData?.socketId === socket.id || producer.closed) {
            producer.close();
            producers.delete(producerId);
            console.log(`[Cleanup] Purged memory Map record for Producer: ${producerId}`);
          }
        }

        // 2. Purge memory map references for Consumers owned by this explicit socket
        for (const [consumerId, consumer] of consumers.entries()) {
          if (consumer.appData?.socketId === socket.id || consumer.closed) {
            consumer.close();
            consumers.delete(consumerId);
            console.log(`[Cleanup] Purged memory Map record for Consumer: ${consumerId}`);
          }
        }

        // 3. Destroy WebRTC Transport engines and C++ pipeline configurations owned by this explicit socket
        for (const [transportId, transport] of transports.entries()) {
          if (transport.appData?.socketId === socket.id || transport.closed) {
            transport.close();
            transports.delete(transportId);
            console.log(`[Cleanup] Torn down in-memory WebRTC Transport: ${transportId}`);
          }
        }

        // 🌟 THE FULL CIRCLE FIX: Safely pull just this specific connection's row out of the database blueprint roster
        try {
          await Room.updateOne(
            { roomId: targetRoomId },
            { $pull: { members: { socketId: socket.id } } }
          );
          console.log(`[Database Sync] Successfully pulled dead connection ${socket.id} from blueprint roster.`);
        } catch (dbErr) {
          console.error(`[Database Error] Failed roster evacuation:`, dbErr.message);
        }

        // 4. Alert remaining room peers to teardown UI elements instantly
        io.to(targetRoomId).emit('peerDisconnected', {
          userId: targetUserId,
          socketId: socket.id
        });

        console.log(`[Ecosystem Sync] Server memory footprint successfully cleared for room: ${targetRoomId}`);
      }
    });
  });
};