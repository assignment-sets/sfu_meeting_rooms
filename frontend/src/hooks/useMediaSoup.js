// frontend/src/hooks/useMediaSoup.js
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

export const useMediaSoup = (serverUrl, roomId, clerkToken) => {
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [mediaStatus, setMediaStatus] = useState('No Media');

  // Array of unified peer profiles: { userId, videoTrack, audioTrack }
  const [remoteFeeds, setRemoteFeeds] = useState([]);
  const [errorLog, setErrorLog] = useState('');
  const [logs, setLogs] = useState([]);

  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const producerTransportRef = useRef(null);
  const consumerTransportRef = useRef(null);
  const localStreamRef = useRef(null);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [{ timestamp, message, type }, ...prev]);
  };

  // 1. Initialize Secured Socket Connection & Global Event Listeners
  useEffect(() => {
    if (!roomId || !clerkToken) return;

    addLog('Connecting secured signaling socket channel...', 'info');
    const socketInstance = io(serverUrl, {
      transports: ['websocket'],
      auth: { token: clerkToken }
    });

    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      setConnectionStatus('Connected');
      addLog('Signaling line active. Initiating room sequence...', 'success');
      executeRoomIngress(roomId);
    });

    // --- REAL-TIME BROADCAST EVENT LISTENERS ---

    // Catch when a newcomer turns on their camera or microphone
    socketInstance.on('newProducerAvailable', async ({ producerId, userId, kind }) => {
      addLog(`Broadcast received: New ${kind} producer available from user ${userId}`, 'warning');

      // Automatically extract and append the specific track type
      await consumeTargetTrack(producerId, userId, kind);
    });

    // Catch when someone drops out or closes their browser tab
    socketInstance.on('peerDisconnected', ({ socketId, userId }) => {
      addLog(`Broadcast received: Peer ${userId} left the environment.`, 'warning');

      // Clean up the UI state completely based on their static, unique userId
      setRemoteFeeds((prev) => prev.filter((feed) => feed.userId !== userId));
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [serverUrl, roomId, clerkToken]);

  // 2. The Core Room Entry Sequence
  const executeRoomIngress = (targetRoomId) => {
    const socket = socketRef.current;

    socket.emit('joinRoom', { roomId: targetRoomId }, async (response) => {
      if (!response.success) {
        setErrorLog(`Room ingress rejected: ${response.error}`);
        return;
      }

      addLog('Ingress authorized. Allocating local media hardware engine...', 'info');
      const { currentMembers } = response.data;

      try {
        // Load the device engine layout parameters
        await new Promise((resolve, reject) => {
          socket.emit('getRouterRtpCapabilities', {}, async (rtpResp) => {
            if (!rtpResp.success) return reject(new Error(rtpResp.error));
            const device = new mediasoupClient.Device();
            await device.load({ routerRtpCapabilities: rtpResp.data });
            deviceRef.current = device;
            resolve();
          });
        });

        // Initialize local capture (Audio + Video) and send transport pipe
        await initializeLocalProduction(targetRoomId);

        // Initialize empty receive transport pipe to accept incoming traffic
        await initializeLocalConsumption(targetRoomId);

        // Loop through everyone ALREADY inside the room and extract their streams immediately
        for (const member of currentMembers) {
          if (member.userId !== socket.userId) {
            // Catch existing video tracks
            if (member.videoProducerId) {
              addLog(`Found existing video track for user: ${member.userId}. Extracting...`, 'info');
              await consumeTargetTrack(member.videoProducerId, member.userId, 'video');
            }
            // Catch existing audio tracks
            if (member.audioProducerId) {
              addLog(`Found existing audio track for user: ${member.userId}. Extracting...`, 'info');
              await consumeTargetTrack(member.audioProducerId, member.userId, 'audio');
            }
          }
        }

      } catch (err) {
        setErrorLog(`Pipeline automation failure: ${err.message}`);
      }
    });
  };

  const initializeLocalProduction = async (targetRoomId) => {
    const socket = socketRef.current;

    return new Promise((resolve, reject) => {
      socket.emit('createWebRtcTransport', { roomId: targetRoomId }, async (transportResp) => {
        if (!transportResp.success) return reject(new Error(transportResp.error));

        const transport = deviceRef.current.createSendTransport(transportResp.data);

        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          socket.emit('connectWebRtcTransport', { transportId: transport.id, dtlsParameters }, (res) => res.success ? callback() : errback(new Error(res.error)));
        });

        transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
          socket.emit('produceMediaStream', { roomId: targetRoomId, transportId: transport.id, kind, rtpParameters }, (res) => res.success ? callback({ id: res.data.id }) : errback(new Error(res.error)));
        });

        producerTransportRef.current = transport;

        // ENABLED BOTH CHANNELS: Capture camera AND microphone hardware tracks natively
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: {
            echoCancellation: true,      // Kills speaker-to-mic feedback loops instantly
            noiseSuppression: true,      // Filters out laptop fans and room hums
            autoGainControl: true,       // Dynamically normalizes volume so you sound clear
            channelCount: 1,             // Forces mono (speech codecs handle mono way better than stereo)
            sampleRate: 48000,           // Sets full studio/VoIP audio frequency
            ideal: {
              latency: 0.01              // Minimizes hardware buffer delays
            }
          }
        });
        localStreamRef.current = stream;
        setMediaStatus('Streaming Live');

        // 1. Publish Video Track
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          await transport.produce({ track: videoTrack });
          addLog('Local video track published successfully.', 'success');
        }

        // 2. Publish Audio Track
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          await transport.produce({ track: audioTrack });
          addLog('Local audio track published successfully.', 'success');
        }

        resolve();
      });
    });
  };

  const initializeLocalConsumption = async (targetRoomId) => {
    const socket = socketRef.current;

    return new Promise((resolve, reject) => {
      socket.emit('createRecvTransport', { roomId: targetRoomId }, async (transportResp) => {
        if (!transportResp.success) return reject(new Error(transportResp.error));

        const transport = deviceRef.current.createRecvTransport(transportResp.data);

        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          socket.emit('connectWebRtcTransport', { transportId: transport.id, dtlsParameters }, (res) => res.success ? callback() : errback(new Error(res.error)));
        });

        consumerTransportRef.current = transport;
        resolve();
      });
    });
  };

  const consumeTargetTrack = async (producerId, userId, kind) => {
    const socket = socketRef.current;
    if (!consumerTransportRef.current) return;

    socket.emit('consumeMediaStream', {
      transportId: consumerTransportRef.current.id,
      producerId,
      rtpCapabilities: deviceRef.current.rtpCapabilities
    }, async (response) => {
      if (!response.success) return;

      const consumerParams = response.data;
      const consumer = await consumerTransportRef.current.consume(consumerParams);

      socket.emit('resumeConsumer', { consumerId: consumer.id }, (resumeResp) => {
        if (resumeResp.success) {
          const incomingTrack = consumer.track;

          // Unified State Orchestration: Map both tracks into the specific userId bucket
          setRemoteFeeds((prev) => {
            const existingFeed = prev.find((f) => f.userId === userId);

            if (existingFeed) {
              // Update the specific track within the existing peer record
              return prev.map((f) => {
                if (f.userId === userId) {
                  return {
                    ...f,
                    videoTrack: kind === 'video' ? incomingTrack : f.videoTrack,
                    audioTrack: kind === 'audio' ? incomingTrack : f.audioTrack,
                  };
                }
                return f;
              });
            } else {
              // Construct a completely fresh user wrapper profile for the first incoming track
              return [
                ...prev,
                {
                  userId,
                  videoTrack: kind === 'video' ? incomingTrack : null,
                  audioTrack: kind === 'audio' ? incomingTrack : null,
                },
              ];
            }
          });

          addLog(`Render pipeline verified: ${kind} channel active for user ${userId}`, 'success');
        }
      });
    });
  };

  return {
    connectionStatus,
    mediaStatus,
    remoteFeeds,
    localStreamRef,
    errorLog,
    logs
  };
};