import { config } from './config.js';
import { Room } from './models/Room.js';
import { clerkClient } from './lib/clerk.js';
import { redisClient } from './lib/redis.js';
import { activeRouters } from './server.js';

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

  // Auth Middleware
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
    // 1. JOIN ROOM (BROADCASTS NEW USER EVENT)
    // ==================================================================
    handleEvent('joinRoom', async (data, clientSocket) => {
      const { roomId } = data;
      if (!roomId) throw new Error('Missing Room ID.');

      const targetRoom = await Room.findOne({ roomId });
      if (!targetRoom) throw new Error('Room not found.');

      await Room.updateOne({ roomId }, { $pull: { members: { userId: clientSocket.userId } } });

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
        { new: true }
      );

      await redisClient.hSet(`socket:${clientSocket.id}`, { userId: clientSocket.userId, roomId });

      clientSocket.join(roomId);
      clientSocket.currentRoomId = roomId;

      // ─── MULTI-USER BROADCAST PING ───
      // Notify existing users in the room that a new peer joined
      clientSocket.to(roomId).emit('newPeerJoined', {
        userId: clientSocket.userId,
        socketId: clientSocket.id
      });

      console.log(`[Room Sync] User ${clientSocket.userId} joined room: ${roomId}`);

      return {
        roomId,
        currentMembers: updatedState.members // New user gets full state layout list
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
    // 4. PRODUCE STREAM TRAFFIC (BROADCASTS NEW PRODUCER SIGNAL)
    // ==================================================================
    handleEvent('produceMediaStream', async (data, clientSocket) => {
      const { transportId, kind, rtpParameters, roomId } = data;
      const transport = transports.get(transportId);
      if (!transport) throw new Error('Send transport pipeline dead.');

      const producer = await transport.produce({ kind, rtpParameters });
      producers.set(producer.id, producer);

      const updateField = kind === 'video' ? "members.$.videoProducerId" : "members.$.audioProducerId";
      await Room.updateOne(
        { roomId, "members.userId": clientSocket.userId },
        { $set: { [updateField]: producer.id } }
      );

      // ─── MULTI-USER BROADCAST PING ───
      // Tell everyone else in this room to instantly consume this new track!
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
    // 8. DISCONNECTION CLEANUP (BROADCASTS EXIT SIGNAL)
    // ==================================================================
    socket.on('disconnect', async () => {
      console.log(`[Signaling] Drop Out: ${socket.id}`);

      const lookupSession = await redisClient.hGetAll(`socket:${socket.id}`);

      if (lookupSession && lookupSession.roomId) {
        const targetRoomId = lookupSession.roomId;
        const targetUserId = lookupSession.userId;

        // Remove from DB
        await Room.updateOne(
          { roomId: targetRoomId },
          { $pull: { members: { socketId: socket.id } } }
        );

        // ─── MULTI-USER BROADCAST PING ───
        // Tell everyone else in the room to instantly drop this user's video boxes
        io.to(targetRoomId).emit('peerDisconnected', {
          userId: targetUserId,
          socketId: socket.id
        });

        console.log(`[Ecosystem Sync] Cleaned room tables for: ${targetRoomId}`);
      }

      await redisClient.del(`socket:${socket.id}`);
    });
  });
};