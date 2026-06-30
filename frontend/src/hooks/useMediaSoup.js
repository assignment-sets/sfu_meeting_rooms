// frontend/src/hooks/useMediaSoup.js
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

export const useMediaSoup = (serverUrl) => {
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [deviceStatus, setDeviceStatus] = useState('Uninitialized');
  const [transportStatus, setTransportStatus] = useState('Not Created');
  const [mediaStatus, setMediaStatus] = useState('No Media');
  const [logs, setLogs] = useState([]);
  const [errorLog, setErrorLog] = useState('');

  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const producerTransportRef = useRef(null);
  const localStreamRef = useRef(null);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [{ timestamp, message, type }, ...prev]);
  };

  useEffect(() => {
    const socketInstance = io(serverUrl, { transports: ['websocket'] });
    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      setConnectionStatus('Connected');
      addLog('Signaling socket connected.', 'success');
    });

    socketInstance.on('connect_error', (err) => {
      setConnectionStatus('Connection Error');
      setErrorLog(`Socket Failed: ${err.message}`);
    });

    return () => socketInstance.disconnect();
  }, [serverUrl]);

  const initializeDevice = () => {
    const socket = socketRef.current;
    setDeviceStatus('Fetching RTP Capabilities...');
    
    socket.emit('getRouterRtpCapabilities', {}, async (response) => {
      if (!response.success) {
        setErrorLog(response.error);
        return;
      }
      try {
        const device = new mediasoupClient.Device();
        await device.load({ routerRtpCapabilities: response.data });
        deviceRef.current = device;
        setDeviceStatus('Loaded & Ready');
        addLog('Device loaded successfully.', 'success');
      } catch (error) {
        setErrorLog(error.message);
      }
    });
  };

  const createSendTransport = () => {
    const socket = socketRef.current;
    if (!deviceRef.current) return;

    setTransportStatus('Creating on server...');
    socket.emit('createWebRtcTransport', {}, async (response) => {
      if (!response.success) {
        setErrorLog(response.error);
        return;
      }

      try {
        const transport = deviceRef.current.createSendTransport(response.data);

        // DTLS Connection Hook
        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          addLog('[Transport Engine] Local "connect" event. Negotiating DTLS handshake...', 'warning');
          
          socket.emit('connectWebRtcTransport', {
            transportId: transport.id,
            dtlsParameters
          }, (serverResp) => {
            if (serverResp.success) {
              addLog('[Transport Engine] Server acknowledged DTLS connection.', 'success');
              callback();
            } else {
              addLog(`[Transport Engine] DTLS connection rejected: ${serverResp.error}`, 'error');
              errback(new Error(serverResp.error));
            }
          });
        });

        // FINAL SEND SPRINT LOGIC: Catch client-side produce event and pipe parameters to backend
        transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
          addLog(`[Transport Engine] Local "produce" event caught for track type [${kind}]. Requesting backend allocation...`, 'warning');
          
          socket.emit('produceMediaStream', {
            transportId: transport.id,
            kind,
            rtpParameters
          }, (serverResp) => {
            if (serverResp.success) {
              const { id } = serverResp.data;
              addLog(`[Transport Engine] Server allocated live Producer! Confirmed ID: ${id}`, 'success');
              callback({ id }); // Pass the real ID back to complete local runtime sequence
            } else {
              addLog(`[Transport Engine] Server rejected production parameters: ${serverResp.error}`, 'error');
              errback(new Error(serverResp.error));
            }
          });
        });

        producerTransportRef.current = transport;
        setTransportStatus('Initialized & Live');
        addLog('Send Transport initialized locally.', 'success');
      } catch (error) {
        setErrorLog(error.message);
      }
    });
  };

  const connectAndProduceStream = async () => {
    if (!producerTransportRef.current) {
      setErrorLog('Cannot produce: Create your send transport first.');
      return;
    }

    try {
      setMediaStatus('Accessing hardware devices...');
      addLog('Requesting browser media tracks...', 'info');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      
      localStreamRef.current = stream;
      setMediaStatus('Media Acquired');
      addLog('Hardware access granted.', 'success');

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      // Kicks off the cascade logic: connect hook -> produce hook
      addLog('Executing transport.produce() for Video track...', 'info');
      await producerTransportRef.current.produce({ track: videoTrack });
      
      addLog('Executing transport.produce() for Audio track...', 'info');
      await producerTransportRef.current.produce({ track: audioTrack });

      setMediaStatus('Connected & Streaming');
      addLog('Production lifecycle sequence executed successfully.', 'success');
    } catch (error) {
      console.error(error);
      setErrorLog(`Media Production Error: ${error.message}`);
      setMediaStatus('Failed');
      addLog(`Stream production crashed: ${error.message}`, 'error');
    }
  };

  return {
    connectionStatus,
    deviceStatus,
    transportStatus,
    mediaStatus,
    logs,
    errorLog,
    initializeDevice,
    createSendTransport,
    connectAndProduceStream
  };
};
