// frontend/src/hooks/useMediaSoup.js
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

export const useMediaSoup = (serverUrl) => {
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [deviceStatus, setDeviceStatus] = useState('Uninitialized');
  const [transportStatus, setTransportStatus] = useState('Not Created');
  const [recvTransportStatus, setRecvTransportStatus] = useState('Not Created'); // New State
  const [mediaStatus, setMediaStatus] = useState('No Media');
  const [logs, setLogs] = useState([]);
  const [errorLog, setErrorLog] = useState('');

  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const producerTransportRef = useRef(null);
  const consumerTransportRef = useRef(null); // New Ref
  const localStreamRef = useRef(null);

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

  // Sprint 1
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

  // Sprint 2
  const createSendTransport = () => {
    const socket = socketRef.current;
    if (!deviceRef.current) return;
    setTransportStatus('Creating on server...');
    socket.emit('createWebRtcTransport', {}, async (response) => {
      if (!response.success) { setErrorLog(response.error); return; }
      try {
        const transport = deviceRef.current.createSendTransport(response.data);
        
        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          socket.emit('connectWebRtcTransport', { transportId: transport.id, dtlsParameters }, (serverResp) => {
            if (serverResp.success) { callback(); } else { errback(new Error(serverResp.error)); }
          });
        });

        transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
          socket.emit('produceMediaStream', { transportId: transport.id, kind, rtpParameters }, (serverResp) => {
            if (serverResp.success) { callback({ id: serverResp.data.id }); } else { errback(new Error(serverResp.error)); }
          });
        });

        producerTransportRef.current = transport;
        setTransportStatus('Initialized & Live');
        addLog('Send Transport initialized locally.', 'success');
      } catch (error) { setErrorLog(error.message); }
    });
  };

  // Sprint 3
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


  // ==========================================================
  // NEW SPRINT: CLIENT RECEIVE TRANSPORT CREATION
  // ==========================================================
  const createRecvTransport = () => {
    const socket = socketRef.current;
    if (!deviceRef.current) {
      setErrorLog('Initialize MediaSoup Device engine first.');
      return;
    }

    setRecvTransportStatus('Creating on server...');
    addLog('Emitting "createRecvTransport" to backend...', 'info');

    socket.emit('createRecvTransport', {}, async (response) => {
      if (!response.success) {
        setErrorLog(`Server failed to allocate receiver: ${response.error}`);
        setRecvTransportStatus('Failed');
        return;
      }

      const transportParams = response.data;
      addLog(`Received server receive parameters. ID: ${transportParams.id}`, 'success');

      try {
        // Create the client side RECEIVE counterpart instead of Send
        const transport = deviceRef.current.createRecvTransport(transportParams);

        // This listener fires automatically the first time we call transport.consume()
        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          addLog('[Recv Transport] Local "connect" event triggered. Sending DTLS to server...', 'warning');
          
          socket.emit('connectWebRtcTransport', {
            transportId: transport.id,
            dtlsParameters
          }, (serverResp) => {
            if (serverResp.success) {
              addLog('[Recv Transport] Server acknowledged DTLS connection.', 'success');
              callback();
            } else {
              addLog(`[Recv Transport] DTLS connection rejected: ${serverResp.error}`, 'error');
              errback(new Error(serverResp.error));
            }
          });
        });

        consumerTransportRef.current = transport;
        setRecvTransportStatus('Initialized & Live');
        addLog(`Client Receive Transport bound successfully! ID: ${transport.id}`, 'success');
        setErrorLog('');
      } catch (error) {
        setErrorLog(`Receive Transport Error: ${error.message}`);
        setRecvTransportStatus('Failed');
      }
    });
  };

  return {
    connectionStatus,
    deviceStatus,
    transportStatus,
    recvTransportStatus, // Expose status
    mediaStatus,
    logs,
    errorLog,
    initializeDevice,
    createSendTransport,
    connectAndProduceStream,
    createRecvTransport // Expose method
  };
};
