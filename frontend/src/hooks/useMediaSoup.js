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

  const localVideoProducerRef = useRef(null);
  const localAudioProducerRef = useRef(null);

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

    socketInstance.on('newPeerJoined', ({ userId }) => {
      addLog(`Broadcast received: Peer ${userId} entered the room silent. Spawning layout container.`, 'info');
      setRemoteFeeds((prev) => {
        // Prevent duplicate containers if they are already in the array
        if (prev.some((feed) => feed.userId === userId)) return prev;
        return [...prev, { userId, videoTrack: null, audioTrack: null }];
      });
    });

    // Catch when a peer turns on their camera or microphone dynamically
    socketInstance.on('newProducerAvailable', async ({ producerId, userId, kind }) => {
      addLog(`Broadcast received: New ${kind} producer available from user ${userId}`, 'warning');
      await consumeTargetTrack(producerId, userId, kind);
    });

    // Catch when a peer explicitly turns OFF just their camera or mic (Strategy 3 Broadcast)
    socketInstance.on('peerStoppedProducer', ({ userId, kind }) => {
      addLog(`Broadcast received: User ${userId} stopped streaming ${kind}`, 'info');
      setRemoteFeeds((prev) =>
        prev.map((f) => {
          if (f.userId === userId) {
            return {
              ...f,
              videoTrack: kind === 'video' ? null : f.videoTrack,
              audioTrack: kind === 'audio' ? null : f.audioTrack
            };
          }
          return f;
        })
      );
    });

    // Catch when someone drops out entirely
    socketInstance.on('peerDisconnected', ({ socketId, userId }) => {
      addLog(`Broadcast received: Peer ${userId} left the environment.`, 'warning');
      setRemoteFeeds((prev) => prev.filter((feed) => feed.userId !== userId));
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [serverUrl, roomId, clerkToken]);

  // 2. The Core Room Entry Sequence (Passively Consume First)
  const executeRoomIngress = (targetRoomId) => {
    const socket = socketRef.current;

    socket.emit('joinRoom', { roomId: targetRoomId }, async (response) => {
      if (!response.success) {
        setErrorLog(`Room ingress rejected: ${response.error}`);
        return;
      }

      addLog('Ingress authorized. Allocating local consumer hardware engine...', 'info');
      const { currentMembers } = response.data;

      try {
        // Load the device engine layer parameters
        await new Promise((resolve, reject) => {
          socket.emit('getRouterRtpCapabilities', {}, async (rtpResp) => {
            if (!rtpResp.success) return reject(new Error(rtpResp.error));
            const device = new mediasoupClient.Device();
            await device.load({ routerRtpCapabilities: rtpResp.data });
            deviceRef.current = device;
            resolve();
          });
        });

        // Instantly seed the layout matrix with EVERY remote member found in the DB blueprint

        const baseFeeds = currentMembers
          .filter((member) => member.socketId !== socket.id) // FIX: Compares socket IDs natively on the client
          .map((member) => ({
            userId: member.userId,
            videoTrack: null,
            audioTrack: null
          }));

        setRemoteFeeds(baseFeeds);
        addLog(`Layout matrix hydrated with ${baseFeeds.length} existing room members.`, 'success');

        // We initialize ONLY consumption pipe. Local production is left unallocated.
        await initializeLocalConsumption(targetRoomId);

        // Extract any existing tracks from users already in the room
        for (const member of currentMembers) {
          if (member.userId !== socket.userId) {
            if (member.videoProducerId) {
              await consumeTargetTrack(member.videoProducerId, member.userId, 'video');
            }
            if (member.audioProducerId) {
              await consumeTargetTrack(member.audioProducerId, member.userId, 'audio');
            }
          }
        }

      } catch (err) {
        setErrorLog(`Pipeline automation failure: ${err.message}`);
      }
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

  // ==================================================================
  // DYNAMIC LAZY PIPELINE GENERATOR
  // ==================================================================

  const ensureSendTransportCreated = async () => {
    // If the pipeline is already built and authenticated, skip creation entirely
    if (producerTransportRef.current) return producerTransportRef.current;

    const socket = socketRef.current;
    addLog('Building dynamic outbound WebRTC transport pipeline...', 'info');

    return new Promise((resolve, reject) => {
      socket.emit('createWebRtcTransport', { roomId }, async (transportResp) => {
        if (!transportResp.success) return reject(new Error(transportResp.error));

        const transport = deviceRef.current.createSendTransport(transportResp.data);

        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          socket.emit('connectWebRtcTransport', { transportId: transport.id, dtlsParameters }, (res) => res.success ? callback() : errback(new Error(res.error)));
        });

        transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
          socket.emit('produceMediaStream', { roomId, transportId: transport.id, kind, rtpParameters }, (res) => res.success ? callback({ id: res.data.id }) : errback(new Error(res.error)));
        });

        producerTransportRef.current = transport;
        addLog('Dynamic outbound transport pipeline secured.', 'success');
        resolve(transport);
      });
    });
  };

  const startLocalTrack = async (kind) => {
    try {
      // 1. Ensure the outbound pipe is fully built and ready
      const transport = await ensureSendTransportCreated();

      addLog(`Requesting local device hardware access for: ${kind}...`, 'info');

      // 2. Fetch specific channel hardware with strict VoiceEngine constraints
      const constraints = {
        video: kind === 'video',
        audio: kind === 'audio' ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
          ideal: { latency: 0.01 }
        } : false
      };

      const freshStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Lazily seed the baseline local compound stream if not already allocated
      if (!localStreamRef.current) {
        localStreamRef.current = new MediaStream();
      }

      if (kind === 'video') {
        const videoTrack = freshStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(videoTrack);

        // Inject the video track into the WebRTC pipeline
        const producer = await transport.produce({ track: videoTrack });
        localVideoProducerRef.current = producer;

        setMediaStatus((prev) => prev === 'Audio Streaming' ? 'Fully Active' : 'Video Streaming');
        addLog('Dynamic local video channel published.', 'success');
      }

      else if (kind === 'audio') {
        const audioTrack = freshStream.getAudioTracks()[0];
        localStreamRef.current.addTrack(audioTrack);

        // Inject the audio track into the WebRTC pipeline
        const producer = await transport.produce({ track: audioTrack });
        localAudioProducerRef.current = producer;

        setMediaStatus((prev) => prev === 'Video Streaming' ? 'Fully Active' : 'Audio Streaming');
        addLog('Dynamic local audio voice channel published.', 'success');
      }

    } catch (err) {
      setErrorLog(`Failed to dynamic-start ${kind} stream: ${err.message}`);
    }
  };

  const stopLocalTrack = async (kind) => {
    const socket = socketRef.current;
    addLog(`Executing Strategy 3 hardware teardown for channel: ${kind}`, 'warning');

    if (kind === 'video' && localVideoProducerRef.current) {
      // 1. Destroy client-side MediaSoup instance to break WebRTC packet generation
      localVideoProducerRef.current.close();
      localVideoProducerRef.current = null;

      // 2. Locate the hardware track, cut power, and extinguish the laptop device light
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
        localStreamRef.current.removeTrack(videoTrack);
      }

      setMediaStatus((prev) => prev === 'Fully Active' ? 'Audio Streaming' : 'No Media');
    }

    else if (kind === 'audio' && localAudioProducerRef.current) {
      // 1. Destroy client-side MediaSoup voice stream instance
      localAudioProducerRef.current.close();
      localAudioProducerRef.current = null;

      // 2. Cut power completely to microphone input node
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.stop();
        localStreamRef.current.removeTrack(audioTrack);
      }

      setMediaStatus((prev) => prev === 'Fully Active' ? 'Video Streaming' : 'No Media');
    }

    // 3. Signal to clean server maps and issue broadcast pings to peers
    socket.emit('stopMediaStream', { kind, roomId });
    addLog(`Local ${kind} engine completely unallocated.`, 'info');
  };

  // ==================================================================

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

          setRemoteFeeds((prev) => {
            const existingFeed = prev.find((f) => f.userId === userId);

            if (existingFeed) {
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
    logs,
    startLocalTrack, // Exposed action button method
    stopLocalTrack   // Exposed action button method
  };
};