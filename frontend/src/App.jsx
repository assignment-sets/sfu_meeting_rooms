// frontend/src/App.jsx
import React, { useEffect, useRef } from "react";
import { useMediaSoup } from "./hooks/useMediaSoup";
import { ControlPanel } from "./components/ControlPanel";
import { LogConsole } from "./components/LogConsole";

const SIGNALING_SERVER_URL =
  "https://subturriculated-unpublicly-shari.ngrok-free.dev";

function App() {
  const {
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
    consumeStream,
    // We need access to the underlying stream objects to feed our HTML elements
    localStreamRef,
  } = useMediaSoup(SIGNALING_SERVER_URL);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Effect to attach local stream to video element when acquired
  useEffect(() => {
    if (localVideoRef.current && localStreamRef?.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [mediaStatus, localStreamRef]);

  // Periodic checker to see if the loopback stream has arrived on the window object
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        window.latestRemoteStream &&
        remoteVideoRef.current &&
        !remoteVideoRef.current.srcObject
      ) {
        console.log("[UI] Attaching remote stream to video element.");
        remoteVideoRef.current.srcObject = window.latestRemoteStream;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
      <header className="max-w-5xl mx-auto mb-8 border-b border-slate-800 pb-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-indigo-400">
          MediaSoup Engine Integration{" "}
          <span className="text-sm font-normal text-slate-400 bg-slate-800 px-2 py-1 rounded ml-2">
            Sprint 5.1
          </span>
        </h1>
        <p className="text-slate-400 mt-1">
          Direct Stream Consumption & Rendering Loop
        </p>
      </header>

      <main className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        <ControlPanel
          serverUrl={SIGNALING_SERVER_URL}
          connectionStatus={connectionStatus}
          deviceStatus={deviceStatus}
          transportStatus={transportStatus}
          recvTransportStatus={recvTransportStatus}
          mediaStatus={mediaStatus}
          onInitializeDevice={initializeDevice}
          onCreateSendTransport={createSendTransport}
          onConnectAndProduceStream={connectAndProduceStream}
          onCreateRecvTransport={createRecvTransport}
          onConsumeStream={consumeStream}
        />

        <div className="md:col-span-2 flex flex-col space-y-4">
          {errorLog && (
            <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 p-4 rounded-xl text-sm font-medium">
              {errorLog}
            </div>
          )}

          {/* ==========================================================
              DISPLAY MONITOR HOUSING (LOCAL & REMOTE STREAMS)
             ========================================================== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Local Feed Monitor */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-lg flex flex-col">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
                Local Camera Stream (Outbound)
              </span>
              <div className="bg-slate-950 rounded-lg aspect-video overflow-hidden flex items-center justify-center relative border border-slate-900">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted={true} // Crucial safety block
                  className="w-full h-full object-cover scale-x-[-1]" // Flipped horizontally for natural mirror behavior
                />
                {!localStreamRef?.current && (
                  <span className="text-xs text-slate-600 absolute">
                    Hardware Offline
                  </span>
                )}
              </div>
            </div>

            {/* Remote Loopback Monitor */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-lg flex flex-col">
              <span className="text-xs font-semibold text-pink-400 uppercase tracking-wider mb-2 block">
                SFU Consumer Loopback (Inbound)
              </span>
              <div className="bg-slate-950 rounded-lg aspect-video overflow-hidden flex items-center justify-center relative border border-slate-900">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={true} // Crucial echo loop prevention check
                  className="w-full h-full object-cover"
                />
                <span className="text-xs text-slate-600 absolute pointer-events-none check-stream-status">
                  Waiting for Consumption Package...
                </span>
              </div>
            </div>
          </div>

          <LogConsole logs={logs} />
        </div>
      </main>
    </div>
  );
}

export default App;
