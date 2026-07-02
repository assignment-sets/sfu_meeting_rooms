// frontend/src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth, SignIn } from "@clerk/react";
import { useMediaSoup } from "./hooks/useMediaSoup";
import { ControlPanel } from "./components/ControlPanel";
import { LogConsole } from "./components/LogConsole";
import { Navbar } from "./components/Navbar";
import { useApi } from "./hooks/useApi";

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL;

function MediaSoupEngine() {
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
      <Navbar />
      <header className="max-w-5xl mx-auto mb-8 border-b border-slate-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-indigo-400">
            MediaSoup Engine Integration{" "}
            <span className="text-sm font-normal text-slate-400 bg-slate-800 px-2 py-1 rounded ml-2">
              Sprint 5.1
            </span>
          </h1>
          <p className="text-slate-400 mt-1">
            Direct Stream Consumption & Rendering Loop
          </p>
        </div>
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

function TestPage() {
  const api = useApi();
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const testAuthEndpoint = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await api.post("/api/test");
      setResponse(res.data);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.message || "Failed to query authenticated endpoint.";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
      <Navbar />
      <header className="max-w-5xl mx-auto mb-8 border-b border-slate-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-indigo-400">
            Auth Token Validator
          </h1>
          <p className="text-slate-400 mt-1">
            Backend Identity verification check
          </p>
        </div>
      </header>

      <main className="max-w-xl mx-auto bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col space-y-6">
        <p className="text-slate-300 text-sm">
          Click the button below to retrieve your current session JWT token from Clerk and perform a POST query to the backend test API.
        </p>

        <button
          onClick={testAuthEndpoint}
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl shadow-lg transition duration-200 cursor-pointer"
        >
          {loading ? "Authenticating Request..." : "Test Authenticated Endpoint"}
        </button>

        {error && (
          <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 p-4 rounded-xl text-sm font-medium">
            Error: {error}
          </div>
        )}

        {response && (
          <div className="flex flex-col space-y-3">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">
              Response from server
            </span>
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-900 overflow-x-auto text-xs font-mono text-emerald-300">
              <pre>{JSON.stringify(response, null, 2)}</pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyHome() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
      <Navbar />
      <main className="max-w-5xl mx-auto py-20 bg-slate-800/40 border border-slate-800 rounded-2xl shadow-xl flex flex-col items-center justify-center text-center">
        <h2 className="text-3xl font-extrabold text-indigo-400 mb-2">Welcome</h2>
        <p className="text-slate-400 max-w-md">
          AETHER project placeholder screen. Open the dropdown menu in the navigation bar to visit other active pages.
        </p>
      </main>
    </div>
  );
}

function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-955 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl flex flex-col items-center">
        <h2 className="text-2xl font-bold text-indigo-400 mb-6">AETHER Auth Gateway</h2>
        <SignIn routing="path" path="/login" signUpUrl="/signup" />
      </div>
    </div>
  );
}

function App() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <span className="text-indigo-400 animate-pulse font-medium">Verifying Session...</span>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login/*"
          element={isSignedIn ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/"
          element={isSignedIn ? <EmptyHome /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/control-panel"
          element={isSignedIn ? <MediaSoupEngine /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/test"
          element={isSignedIn ? <TestPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;




