// frontend/src/App.jsx
import React from 'react';
import { useMediaSoup } from './hooks/useMediaSoup';
import { ControlPanel } from './components/ControlPanel';
import { LogConsole } from './components/LogConsole';

const SIGNALING_SERVER_URL = 'https://subturriculated-unpublicly-shari.ngrok-free.dev';

function App() {
  const {
    connectionStatus,
    deviceStatus,
    transportStatus,
    logs,
    errorLog,
    initializeDevice,
    createSendTransport,
  } = useMediaSoup(SIGNALING_SERVER_URL);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
      <header className="max-w-5xl mx-auto mb-8 border-b border-slate-800 pb-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-indigo-400">
          MediaSoup Engine Integration <span className="text-sm font-normal text-slate-400 bg-slate-800 px-2 py-1 rounded ml-2">Modular Structure</span>
        </h1>
        <p className="text-slate-400 mt-1">WebRTC Architecture</p>
      </header>

      <main className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        <ControlPanel
          serverUrl={SIGNALING_SERVER_URL}
          connectionStatus={connectionStatus}
          deviceStatus={deviceStatus}
          transportStatus={transportStatus}
          onInitializeDevice={initializeDevice}
          onCreateSendTransport={createSendTransport}
        />

        <div className="md:col-span-2 flex flex-col space-y-4">
          {errorLog && (
            <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 p-4 rounded-xl text-sm font-medium">
              {errorLog}
            </div>
          )}
          <LogConsole logs={logs} />
        </div>
      </main>
    </div>
  );
}

export default App;
