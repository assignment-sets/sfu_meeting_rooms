// frontend/src/components/ControlPanel.jsx
import React from 'react';

export const ControlPanel = ({ 
  serverUrl, 
  connectionStatus, 
  deviceStatus, 
  transportStatus,
  mediaStatus, 
  onInitializeDevice, 
  onCreateSendTransport,
  onConnectAndProduceStream
}) => {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 h-fit space-y-4 shadow-lg">
      <h2 className="text-lg font-bold border-b border-slate-700 pb-2 text-slate-200">Control Interface</h2>
      
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tunnel Link</label>
        <div className="text-sm font-mono bg-slate-950 p-2 rounded border border-slate-800 text-indigo-300 truncate">{serverUrl}</div>
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

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-slate-400 block font-semibold uppercase mb-0.5">Transport</span>
          <span className="font-medium text-sm block text-indigo-400">{transportStatus}</span>
        </div>
        <div>
          <span className="text-slate-400 block font-semibold uppercase mb-0.5">Media Pipeline</span>
          <span className="font-medium text-sm block text-amber-400">{mediaStatus}</span>
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
          disabled={transportStatus === 'Initialized & Live'}
          className="w-full disabled:opacity-40 bg-slate-700 hover:bg-slate-600 text-white font-medium text-sm py-2 px-4 rounded-lg transition"
        >
          2. Create Send Transport
        </button>
        <button
          onClick={onConnectAndProduceStream}
          className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium text-sm py-2.5 px-4 rounded-lg transition shadow-md shadow-emerald-900/20"
        >
          3. Produce Media & Connect DTLS
        </button>
      </div>
    </div>
  );
};
