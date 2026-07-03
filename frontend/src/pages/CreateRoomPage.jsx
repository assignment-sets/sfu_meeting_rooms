import React, { useState } from "react";
import { Navbar } from "../components/Navbar";
import { useApi } from "../hooks/useApi";

export default function CreateRoomPage() {
  const api = useApi();
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const createRoom = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await api.post("/api/rooms/create");
      setResponse(res.data);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.message || "Failed to create isolated room.";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!response?.inviteLink) return;
    try {
      await navigator.clipboard.writeText(response.inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
      <Navbar />
      <header className="max-w-5xl mx-auto mb-8 border-b border-slate-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-indigo-400">
            Room Generator
          </h1>
          <p className="text-slate-400 mt-1">
            Instantiate an isolated WebRTC meeting room
          </p>
        </div>
      </header>

      <main className="max-w-xl mx-auto bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col space-y-6">
        <p className="text-slate-300 text-sm">
          Click the button below to spawn a new isolated room. The backend will allocate a dedicated C++ MediaSoup router instance for this session.
        </p>

        <button
          onClick={createRoom}
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl shadow-lg transition duration-200 cursor-pointer"
        >
          {loading ? "Allocating Room..." : "Create Isolated Room"}
        </button>

        {error && (
          <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 p-4 rounded-xl text-sm font-medium">
            Error: {error}
          </div>
        )}

        {response && (
          <div className="flex flex-col space-y-4 border-t border-slate-700 pt-4">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">
              Room Created Successfully
            </span>
            
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-850 flex flex-col space-y-2 text-sm text-slate-300">
              <div>
                <span className="text-xs font-semibold text-slate-500 block uppercase">Room ID</span>
                <span className="font-mono text-indigo-300">{response.roomId}</span>
              </div>
              <div className="pt-2">
                <span className="text-xs font-semibold text-slate-500 block uppercase">Invite Link</span>
                <span className="font-mono text-slate-400 break-all">{response.inviteLink}</span>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleCopy}
                className="flex-1 bg-slate-700 hover:bg-slate-650 active:scale-[0.98] text-slate-200 font-semibold py-2.5 px-4 rounded-xl transition duration-200 cursor-pointer text-center text-sm"
              >
                {copied ? "Copied!" : "Copy Invite Link"}
              </button>
              
              <button
                onClick={() => window.location.href = response.inviteLink}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-semibold py-2.5 px-4 rounded-xl shadow-md transition duration-200 cursor-pointer text-center text-sm"
              >
                Join Room
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
