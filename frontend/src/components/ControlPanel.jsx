// frontend/src/components/ControlPanel.jsx
import React, { useState } from "react";

export const ControlPanel = ({
  serverUrl,
  connectionStatus,
  deviceStatus,
  transportStatus,
  recvTransportStatus,
  mediaStatus,
  onInitializeDevice,
  onCreateSendTransport,
  onConnectAndProduceStream,
  onCreateRecvTransport,
  onConsumeStream,
}) => {
  const [inputProducerId, setInputProducerId] = useState("");

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 h-fit space-y-4 shadow-lg">
      <h2 className="text-lg font-bold border-b border-slate-700 pb-2 text-slate-200">
        Control Interface
      </h2>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-slate-400 block font-semibold uppercase mb-0.5">
            Device Engine
          </span>
          <span className="font-medium text-sm block text-emerald-400">
            {deviceStatus}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block font-semibold uppercase mb-0.5">
            Media Pipeline
          </span>
          <span className="font-medium text-sm block text-amber-400">
            {mediaStatus}
          </span>
        </div>
      </div>

      <div className="space-y-2 pt-2 text-xs">
        <button
          onClick={onInitializeDevice}
          disabled={deviceStatus === "Loaded & Ready"}
          className="w-full disabled:opacity-40 bg-slate-700 hover:bg-slate-600 py-1.5 px-3 rounded text-white font-medium"
        >
          1. Initialize Device
        </button>
        <button
          onClick={onCreateSendTransport}
          disabled={transportStatus === "Initialized & Live"}
          className="w-full disabled:opacity-40 bg-slate-700 hover:bg-slate-600 py-1.5 px-3 rounded text-white font-medium"
        >
          2. Create Send Transport
        </button>
        <button
          onClick={onConnectAndProduceStream}
          disabled={mediaStatus === "Connected & Streaming"}
          className="w-full disabled:opacity-40 bg-emerald-600 hover:bg-emerald-500 py-1.5 px-3 rounded text-white font-medium"
        >
          3. Produce Media
        </button>
        <button
          onClick={onCreateRecvTransport}
          disabled={recvTransportStatus === "Initialized & Live"}
          className="w-full disabled:opacity-40 bg-slate-700 hover:bg-slate-600 py-1.5 px-3 rounded text-white font-medium"
        >
          4. Create Recv Transport
        </button>
      </div>

      {/* INPUT INTERFACE FOR SPENT 5 */}
      <div className="border-t border-slate-700 pt-3 space-y-2">
        <label className="block text-xs font-semibold text-pink-400 uppercase tracking-wider">
          5. Consume Target Stream
        </label>
        <input
          type="text"
          value={inputProducerId}
          onChange={(e) => setInputProducerId(e.target.value)}
          placeholder="Paste Video Producer ID here..."
          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-pink-500"
        />
        <button
          onClick={() => onConsumeStream(inputProducerId)}
          className="w-full bg-pink-600 hover:bg-pink-500 active:bg-pink-700 text-white font-medium text-sm py-2 px-4 rounded-lg transition shadow-md shadow-pink-900/20"
        >
          Consume Media Track
        </button>
      </div>
    </div>
  );
};
