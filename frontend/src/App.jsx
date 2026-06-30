// frontend/src/App.jsx
import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

const SIGNALING_SERVER_URL = 'https://subturriculated-unpublicly-shari.ngrok-free.dev'; 

function App() {
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [deviceStatus, setDeviceStatus] = useState('Uninitialized');
  const [transportStatus, setTransportStatus] = useState('Not Created');
  const [logs, setLogs] = useState([]);
  const [errorLog, setErrorLog] = useState('');

  // Use refs to store the mutable MediaSoup engine components across renders
  const deviceRef = useRef(null);
  const producerTransportRef = useRef(null);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [{ timestamp, message, type }, ...prev]);
  };

  useEffect(() => {
    addLog(`Connecting to signaling server at: ${SIGNALING_SERVER_URL}`, 'info');
    
    const socketInstance = io(SIGNALING_SERVER_URL, { transports: ['websocket'] });
    setSocket(socketInstance);

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
  }, []);

  // --- Sprint 1 Logic ---
  const initializeMediaSoupDevice = () => {
    if (!socket || !socket.connected) {
      setErrorLog('Cannot initialize: Socket signaling channel is not active.');
      return;
    }

    setDeviceStatus('Fetching RTP Capabilities...');
    socket.emit('getRouterRtpCapabilities', {}, async (response) => {
      if (!response.success) {
        setErrorLog(`Failed to get capabilities: ${response.error}`);
        setDeviceStatus('Failed');
        return;
      }

      try {
        const device = new mediasoupClient.Device();
        await device.load({ routerRtpCapabilities: response.data });
        
        deviceRef.current = device; // Save instance to ref
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

  // --- Sprint 2 Logic: Create Send Transport ---
  const createSendTransport = () => {
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
      console.log('Server WebRtcTransport Parameters:', transportParams);

      try {
        addLog('Instantiating client-side Send Transport configuration...', 'info');
        
        // Instruct device to instantiate the client side counterpart
        const transport = deviceRef.current.createSendTransport(transportParams);

        // --- IMPORTANT CRITICAL PLACEHOLDERS FOR NEXT SPRINT ---
        // MediaSoup client-side transport hooks require event listeners to execute properly.
        // We will define these fully during actual track production later.
        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          addLog('[Transport Engine] Hook "connect" triggered. (Will handle in later sprint)', 'warning');
          callback();
        });

        transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
          addLog('[Transport Engine] Hook "produce" triggered. (Will handle in later sprint)', 'warning');
          callback({ id: 'dummy-producer-id' });
        });
        // --- END PLACEHOLDERS ---

        producerTransportRef.current = transport;
        setTransportStatus('Initialized & Live');
        addLog(`Client Send Transport bound successfully! ID: ${transport.id}`, 'success');
        setErrorLog('');
      } catch (error) {
        console.error('Client transport initialization failed:', error);
        setErrorLog(`Transport Creation Error: ${error.message}`);
        setTransportStatus('Failed');
        addLog(`Client side instantiation crashed: ${error.message}`, 'error');
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
      <header className="max-w-5xl mx-auto mb-8 border-b border-slate-800 pb-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-indigo-400">
          MediaSoup Engine Integration <span className="text-sm font-normal text-slate-400 bg-slate-800 px-2 py-1 rounded ml-2">Sprint 2</span>
        </h1>
        <p className="text-slate-400 mt-1">WebRTC Transport Interlink Framework</p>
      </header>

      <main className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Control Interface */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 h-fit space-y-4 shadow-lg">
          <h2 className="text-lg font-bold border-b border-slate-700 pb-2 text-slate-200">Control Interface</h2>
          
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tunnel Link</label>
            <div className="text-sm font-mono bg-slate-950 p-2 rounded border border-slate-800 text-indigo-300 truncate">{SIGNALING_SERVER_URL}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-400 block font-semibold uppercase mb-0.5">Signaling</span>
              <span className="font-medium text-sm block">{connectionStatus}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold uppercase mb-0.5">Device Engine</span>
              <span className="font-medium text-sm block text-emerald-400">{deviceStatus}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Send Transport Status</label>
            <div className={`text-sm font-bold mt-1 inline-block px-2 py-1 rounded ${transportStatus === 'Initialized & Live' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-slate-950 text-slate-400'}`}>
              {transportStatus}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={initializeMediaSoupDevice}
              disabled={deviceStatus === 'Loaded & Ready'}
              className="w-full disabled:opacity-40 bg-slate-700 hover:bg-slate-600 text-white font-medium text-sm py-2 px-4 rounded-lg transition"
            >
              1. Initialize Device
            </button>
            <button
              onClick={createSendTransport}
              className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-sm py-2.5 px-4 rounded-lg transition shadow-md shadow-indigo-900/20"
            >
              2. Create Send Transport
            </button>
          </div>
        </div>

        {/* Diagnostic Logs */}
        <div className="md:col-span-2 flex flex-col space-y-4">
          {errorLog && (
            <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 p-4 rounded-xl text-sm font-medium">
              {errorLog}
            </div>
          )}

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex-1 flex flex-col min-h-[400px] shadow-lg">
            <h2 className="text-lg font-bold border-b border-slate-700 pb-2 text-slate-200 mb-3">Live Log Diagnostics</h2>
            <div className="flex-1 overflow-y-auto max-h-[350px] space-y-2 font-mono text-xs">
              {logs.map((log, index) => (
                <div key={index} className="p-2 rounded bg-slate-950 border border-slate-900 flex items-start space-x-2">
                  <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                  <span className={
                    log.type === 'success' ? 'text-emerald-400 font-medium' :
                    log.type === 'error' ? 'text-rose-400 font-medium' :
                    log.type === 'warning' ? 'text-amber-400' : 'text-slate-300'
                  }>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

export default App;
