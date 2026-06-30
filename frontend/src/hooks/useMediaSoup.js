// frontend/src/hooks/useMediaSoup.js
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

export const useMediaSoup = (serverUrl) => {
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [deviceStatus, setDeviceStatus] = useState('Uninitialized');
  const [transportStatus, setTransportStatus] = useState('Not Created');
  const [recvTransportStatus, setRecvTransportStatus] = useState('Not Created');
  const [mediaStatus, setMediaStatus] = useState('No Media');
  const [logs, setLogs] = useState([]);
  const [errorLog, setErrorLog] = useState('');

  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const producerTransportRef = useRef(null);
  const consumerTransportRef = useRef(null);
  const localStreamRef = useRef(null);

  // New ref to store our generated consumer track 
  const remoteTrackRef = useRef(null);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [{ timestamp, message, type }, ...prev]);
  };

  useEffect(() => {
    const socketInstance = io(serverUrl, { transports: ['websocket'] });
    socketRef.current = socketInstance;
    socketInstance.on('connect', () => setConnectionStatus('Connected'));
    return () => socketInstance.disconnect();
  }, [serverUrl]);

  const initializeDevice = () => {
    const socket = socketRef.current;
    setDeviceStatus('Fetching RTP Capabilities...');
    socket.emit('getRouterRtpCapabilities', {}, async (response) => {
      if (!response.success) { setErrorLog(response.error); return; }
      try {
        const device = new mediasoupClient.Device();
        await device.load({ routerRtpCapabilities: response.data });
        deviceRef.current = device;
        setDeviceStatus('Loaded & Ready');
        addLog('Device loaded successfully.', 'success');
      } catch (error) { setErrorLog(error.message); }
    });
  };

  const createSendTransport = () => {
    const socket = socketRef.current;
    if (!deviceRef.current) return;
    socket.emit('createWebRtcTransport', {}, async (response) => {
      if (!response.success) { setErrorLog(response.error); return; }
      try {
        const transport = deviceRef.current.createSendTransport(response.data);
        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          socket.emit('connectWebRtcTransport', { transportId: transport.id, dtlsParameters }, (res) => res.success ? callback() : errback(new Error(res.error)));
        });
        transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
          socket.emit('produceMediaStream', { transportId: transport.id, kind, rtpParameters }, (res) => res.success ? callback({ id: res.data.id }) : errback(new Error(res.error)));
        });
        producerTransportRef.current = transport;
        setTransportStatus('Initialized & Live');
        addLog('Send Transport initialized locally.', 'success');
      } catch (error) { setErrorLog(error.message); }
    });
  };

  const connectAndProduceStream = async () => {
    if (!producerTransportRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      setMediaStatus('Connected & Streaming');
      await producerTransportRef.current.produce({ track: stream.getVideoTracks()[0] });
      await producerTransportRef.current.produce({ track: stream.getAudioTracks()[0] });
      addLog('Production lifecycle sequence executed successfully.', 'success');
    } catch (error) { setErrorLog(error.message); }
  };

  const createRecvTransport = () => {
    const socket = socketRef.current;
    if (!deviceRef.current) return;
    socket.emit('createRecvTransport', {}, async (response) => {
      if (!response.success) { setErrorLog(response.error); return; }
      try {
        const transport = deviceRef.current.createRecvTransport(response.data);

        // This is lazy. It triggers only when we call transport.consume()
        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          addLog('[Recv Transport] Handshake initiated! Pushing DTLS keys to backend...', 'warning');
          socket.emit('connectWebRtcTransport', { transportId: transport.id, dtlsParameters }, (serverResp) => {
            if (serverResp.success) {
              addLog('[Recv Transport] DTLS Pipe linked and locked.', 'success');
              callback();
            } else {
              errback(new Error(serverResp.error));
            }
          });
        });

        consumerTransportRef.current = transport;
        setRecvTransportStatus('Initialized & Live');
        addLog('Receive Transport initialized locally.', 'success');
      } catch (error) { setErrorLog(error.message); }
    });
  };

  const consumeStream = (targetProducerId) => {
    const socket = socketRef.current;
    if (!consumerTransportRef.current) {
      setErrorLog('Cannot consume: Create your receive transport first.');
      return;
    }
    if (!targetProducerId.trim()) {
      setErrorLog('Please enter a valid Producer ID in the input box.');
      return;
    }

    addLog(`Requesting consumption for Producer ID: ${targetProducerId}`, 'info');

    socket.emit('consumeMediaStream', {
      transportId: consumerTransportRef.current.id,
      producerId: targetProducerId,
      rtpCapabilities: deviceRef.current.rtpCapabilities
    }, async (response) => {
      if (!response.success) {
        setErrorLog(`Server failed to instantiate consumer: ${response.error}`);
        addLog(`Server rejected consumer allocation: ${response.error}`, 'error');
        return;
      }

      const consumerParams = response.data;
      addLog(`Consumer parameters received from server. ID: ${consumerParams.id}`, 'success');

      try {
        // 1. Initialize local representation of consumer (Triggers lazy connect)
        const consumer = await consumerTransportRef.current.consume(consumerParams);
        const { track } = consumer;
        remoteTrackRef.current = track;

        addLog(`Client-side Consumer engine online. Track Type: [${consumer.kind}]`, 'success');

        // 2. NEW: Fire the resume call to the server to unpause packet generation
        addLog(`Requesting server to resume consumer pipeline...`, 'info');
        socket.emit('resumeConsumer', { consumerId: consumer.id }, (resumeResp) => {
          if (resumeResp.success) {
            addLog(`[MediaSoup] Server unpaused stream packet transmission!`, 'success');

            // 3. Bind the active track to a stream and mount it to the window
            const remoteStream = new MediaStream([track]);
            window.latestRemoteStream = remoteStream;

            setErrorLog('');
            addLog('🚀 SUCCESS! Live stream packet pipe verified.', 'success');
          } else {
            setErrorLog(`Failed to resume consumer: ${resumeResp.error}`);
            addLog(`Server failed to resume consumer: ${resumeResp.error}`, 'error');
          }
        });

      } catch (error) {
        setErrorLog(`Client Consumer Error: ${error.message}`);
        addLog(`Client consumer engine failed: ${error.message}`, 'error');
      }
    });
  };

  return {
    connectionStatus,
    deviceStatus,
    transportStatus,
    recvTransportStatus,
    mediaStatus,
    logs,
    errorLog,
    initializeDevice,
    createSendTransport,
    connectAndProduceStream,
    createRecvTransport,
    consumeStream, // Export to UI
    localStreamRef
  };
};