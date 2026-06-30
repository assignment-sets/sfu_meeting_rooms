// frontend/src/App.jsx
import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

// Your live ngrok URL
const SIGNALING_SERVER_URL = 'https://subturriculated-unpublicly-shari.ngrok-free.dev'; 

function App() {
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [deviceStatus, setDeviceStatus] = useState('Uninitialized');
  const [logs, setLogs] = useState([]);
  const [errorLog, setErrorLog] = useState('');

  // Helper to add readable logs in the UI
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [{ timestamp, message, type }, ...prev]);
  };

  useEffect(() => {
    addLog(`Connecting to signaling server at: ${SIGNALING_SERVER_URL}`, 'info');
    
    const socketInstance = io(SIGNALING_SERVER_URL, {
      transports: ['websocket']
    });
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

  const initializeMediaSoupDevice = () => {
    if (!socket || !socket.connected) {
      setErrorLog('Cannot initialize: Socket signaling channel is not active.');
      return;
    }

    setDeviceStatus('Fetching RTP Capabilities...');
    addLog('Emitting "getRouterRtpCapabilities" to server...', 'info');

    socket.emit('getRouterRtpCapabilities', {}, async (response) => {
      if (!response.success) {
        setErrorLog(`Failed to get capabilities: ${response.error}`);
        setDeviceStatus('Failed');
        addLog(`Server rejected RTP capabilities request: ${response.error}`, 'error');
        return;
      }

      const routerRtpCapabilities = response.data;
      addLog('Successfully received Router RTP Capabilities from server.', 'success');
      console.log('Router RTP Capabilities:', routerRtpCapabilities);

      try {
        addLog('Instantiating local MediaSoup Client Device...', 'info');
        const device = new mediasoupClient.Device();

        addLog('Loading router capabilities into device...', 'info');
        await device.load({ routerRtpCapabilities });

        setDeviceStatus('Loaded & Ready');
        addLog(`Device loaded successfully. Handler targeted: ${device.handlerName || 'Default'}`, 'success');
        setErrorLog('');
        console.log('MediaSoup Device Instance:', device);
      } catch (error) {
        console.error('Device load error:', error);
        setErrorLog(`Device Engine Error: ${error.message}`);
        setDeviceStatus('Failed');
        addLog(`Device loading failed: ${error.message}`, 'error');
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
      <header className="max-w-5xl mx-auto mb-8 border-b border-slate-800 pb-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-indigo-400">
          MediaSoup Engine Integration <span className="text-sm font-normal text-slate-400 bg-slate-800 px-2 py-1 rounded ml-2">Sprint 1</span>
        </h1>
        <p className="text-slate-400 mt-1">Status and Handshake Validation Framework</p>
      </header>

      <main className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Control Panel Panel */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 h-fit space-y-5 shadow-lg">
          <h2 className="text-lg font-bold border-b border-slate-700 pb-2 text-slate-200">Control Interface</h2>
          
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tunnel URL</label>
            <div className="text-sm font-mono bg-slate-950 p-2 rounded border border-slate-800 overflow-x-auto text-indigo-300 select-all">
              {SIGNALING_SERVER_URL}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Signaling Status</label>
            <div className="flex items-center space-x-2">
              <span className={`h-3 w-3 rounded-full ${connectionStatus === 'Connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="font-medium text-sm">{connectionStatus}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">MediaSoup Device Engine</label>
            <div className={`text-sm font-bold mt-1 inline-block px-2 py-1 rounded ${deviceStatus === 'Loaded & Ready' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-950 text-slate-400'}`}>
              {deviceStatus}
            </div>
          </div>

          <button
            onClick={initializeMediaSoupDevice}
            className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-sm py-2.5 px-4 rounded-lg transition shadow-md shadow-indigo-900/20"
          >
            Initialize Device
          </button>
        </div>

        {/* Dynamic Event Logs & Diagnostics */}
        <div className="md:col-span-2 flex flex-col space-y-4">
          {errorLog && (
            <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 p-4 rounded-xl text-sm font-medium">
              <span className="font-bold block text-rose-400 mb-0.5">Critical Subsystem Error:</span>
              {errorLog}
            </div>
          )}

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex-1 flex flex-col min-h-[400px] shadow-lg">
            <h2 className="text-lg font-bold border-b border-slate-700 pb-2 text-slate-200 mb-3">Live Log Diagnostics</h2>
            <div className="flex-1 overflow-y-auto max-h-[350px] space-y-2 font-mono text-xs pr-2">
              {logs.length === 0 ? (
                <div className="text-slate-500 italic text-center pt-10">System idle. Waiting for interaction loop...</div>
              ) : (
                logs.map((log, index) => (
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
                ))
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

export default App;
