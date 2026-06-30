// frontend/src/components/ControlPanel.jsx
import React from 'react';

export const ControlPanel = ({ 
  serverUrl, 
  connectionStatus, 
  deviceStatus, 
  transportStatus, 
  onInitializeDevice, 
  onCreateSendTransport 
}) => {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 h-fit space-y-4 shadow-lg">
      <h2 className="text-lg font-bold border-b border-slate-700 pb-2 text-slate-200">Control Interface</h2>
      
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tunnel Link</label>
        <div className="text-sm font-mono bg-slate-950 p-2 rounded border border-slate-800 text-indigo-300 truncate">
          {serverUrl}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-slate-400 block font-semibold uppercase mb-0.5">Signaling</span>
          <span className="font-medium text-sm block">{connectionStatus}</span>
        </div>
        <div>
          <span className="text-slate-400 block font-semibold uppercase mb-0.5">Device Engine</span>
          <span className={`font-medium text-sm block ${deviceStatus === 'Loaded & Ready' ? 'text-emerald-400' : 'text-slate-400'}`}>
            {deviceStatus}
          </span>
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
          onClick={onInitializeDevice}
          disabled={deviceStatus === 'Loaded & Ready'}
          className="w-full disabled:opacity-40 bg-slate-700 hover:bg-slate-600 text-white font-medium text-sm py-2 px-4 rounded-lg transition"
        >
          1. Initialize Device
        </button>
        <button
          onClick={onCreateSendTransport}
          className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-sm py-2.5 px-4 rounded-lg transition shadow-md shadow-indigo-900/20"
        >
          2. Create Send Transport
        </button>
      </div>
    </div>
  );
};
