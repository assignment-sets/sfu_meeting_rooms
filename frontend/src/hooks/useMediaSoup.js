// frontend/src/hooks/useMediaSoup.js
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

export const useMediaSoup = (serverUrl) => {
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [deviceStatus, setDeviceStatus] = useState('Uninitialized');
  const [transportStatus, setTransportStatus] = useState('Not Created');
  const [logs, setLogs] = useState([]);
  const [errorLog, setErrorLog] = useState('');

  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const producerTransportRef = useRef(null);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [{ timestamp, message, type }, ...prev]);
  };

  useEffect(() => {
    addLog(`Connecting to signaling server at: ${serverUrl}`, 'info');
    
    const socketInstance = io(serverUrl, { transports: ['websocket'] });
    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      setConnectionStatus('Connected');
      addLog(`Signaling socket connected successfully! ID: ${socketInstance.id}`, 'success');
    });

    socketInstance.on('connect_error', (err) => {
      setConnectionStatus('Connection Error');
      setErrorLog(`Socket Connection Failed: ${err.message}`);
      addLog(`Socket error: ${err.message}`, 'error');
    });

    socketInstance.on('disconnect', () => {
      setConnectionStatus('Disconnected');
      addLog('Signaling socket disconnected.', 'warning');
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [serverUrl]);

  const initializeDevice = () => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      setErrorLog('Cannot initialize: Socket signaling channel is not active.');
      return;
    }

    setDeviceStatus('Fetching RTP Capabilities...');
    addLog('Emitting "getRouterRtpCapabilities" to backend...', 'info');

    socket.emit('getRouterRtpCapabilities', {}, async (response) => {
      if (!response.success) {
        setErrorLog(`Failed to get capabilities: ${response.error}`);
        setDeviceStatus('Failed');
        addLog(`Server rejected RTP capabilities request: ${response.error}`, 'error');
        return;
      }

      try {
        const device = new mediasoupClient.Device();
        await device.load({ routerRtpCapabilities: response.data });
        
        deviceRef.current = device;
        setDeviceStatus('Loaded & Ready');
        addLog(`Device loaded successfully. Handler: ${device.handlerName}`, 'success');
        setErrorLog('');
      } catch (error) {
        setErrorLog(`Device Engine Error: ${error.message}`);
        setDeviceStatus('Failed');
        addLog(`Device loading failed: ${error.message}`, 'error');
      }
    });
  };

  const createSendTransport = () => {
    const socket = socketRef.current;
    if (!deviceRef.current) {
      setErrorLog('Cannot create transport: Initialize MediaSoup Device engine first.');
      return;
    }

    setTransportStatus('Requesting server creation...');
    addLog('Emitting "createWebRtcTransport" to backend...', 'info');

    socket.emit('createWebRtcTransport', {}, async (response) => {
      if (!response.success) {
        setErrorLog(`Server failed to allocate transport: ${response.error}`);
        setTransportStatus('Failed');
        addLog(`Server rejected transport allocation: ${response.error}`, 'error');
        return;
      }

      const transportParams = response.data;
      addLog(`Received server transport parameters. ID: ${transportParams.id}`, 'success');

      try {
        const transport = deviceRef.current.createSendTransport(transportParams);

        // Placeholders for subsequent sprints
        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          addLog('[Transport Engine] Hook "connect" triggered.', 'warning');
          callback();
        });

        transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
          addLog('[Transport Engine] Hook "produce" triggered.', 'warning');
          callback({ id: 'dummy-producer-id' });
        });

        producerTransportRef.current = transport;
        setTransportStatus('Initialized & Live');
        addLog(`Client Send Transport bound successfully! ID: ${transport.id}`, 'success');
        setErrorLog('');
      } catch (error) {
        setErrorLog(`Transport Creation Error: ${error.message}`);
        setTransportStatus('Failed');
        addLog(`Client side instantiation crashed: ${error.message}`, 'error');
      }
    });
  };

  return {
    connectionStatus,
    deviceStatus,
    transportStatus,
    logs,
    errorLog,
    initializeDevice,
    createSendTransport
  };
};
