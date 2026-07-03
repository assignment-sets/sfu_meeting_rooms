import React, { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, Navigate } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { useMediaSoup } from "../hooks/useMediaSoup";
import { LogConsole } from "../components/LogConsole";
import { Navbar } from "../components/Navbar";

const SIGNALING_SERVER_URL =
  import.meta.env.VITE_SIGNALING_SERVER_URL || "http://localhost:3000";

// Upgraded track-aware helper component to parse out raw audio/video streams cleanly
const VideoBox = ({ stream, videoTrack, audioTrack, label, isLocal }) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  // Synchronize the Video Output Pipeline
  useEffect(() => {
    if (!videoRef.current) return;

    if (stream) {
      // Local setup passes the complete media stream payload directly
      videoRef.current.srcObject = stream;
    } else if (videoTrack) {
      // Remote setup extracts track context into a dynamic HTML element stream wrapper
      videoRef.current.srcObject = new MediaStream([videoTrack]);
    } else {
      videoRef.current.srcObject = null;
    }
  }, [stream, videoTrack]);

  // Synchronize the Audio Output Pipeline
  useEffect(() => {
    // Only target remote tracks; local track playback causes acoustic feedback loops
    if (audioRef.current && audioTrack && !isLocal) {
      audioRef.current.srcObject = new MediaStream([audioTrack]);
    }
  }, [audioTrack, isLocal]);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-lg flex flex-col items-center">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block self-start">
        {label} {isLocal && "(You)"}
      </span>
      <div className="bg-slate-950 rounded-lg aspect-video w-full overflow-hidden flex items-center justify-center relative border border-slate-900">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal} // Hard prevention against hearing your own microphone echo
          className={`w-full h-full object-cover ${isLocal ? "scale-x-[-1]" : ""}`}
        />

        {/* Hidden discrete HTML audio element to output incoming peer voice tracks */}
        {!isLocal && audioTrack && <audio ref={audioRef} autoPlay />}
      </div>
    </div>
  );
};

export default function RoomPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const { getToken } = useAuth();
  const [token, setToken] = useState(null);

  const isActive = searchParams.get("active") === "true";

  // Fetch verified Clerk bearer credentials before mounting socket pipeline connection
  useEffect(() => {
    if (!isActive) return;
    const fetchSessionToken = async () => {
      const sessionToken = await getToken();
      setToken(sessionToken);
    };
    fetchSessionToken();
  }, [getToken, isActive]);

  const {
    connectionStatus,
    mediaStatus,
    remoteFeeds,
    localStreamRef,
    errorLog,
    logs,
  } = useMediaSoup(SIGNALING_SERVER_URL, roomId, token);

  if (!isActive) {
    return <Navigate to="/" replace />;
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <span className="text-indigo-400 animate-pulse font-medium">
          Authorizing Stream Handshake...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
      <Navbar />

      <header className="max-w-6xl mx-auto mb-6 border-b border-slate-800 pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-indigo-400">
            Meeting Workspace:{" "}
            <span className="text-sm font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded select-all">
              {roomId}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Status: Connection:{" "}
            <span className="text-emerald-400 font-semibold">
              {connectionStatus}
            </span>{" "}
            | Media Profile:{" "}
            <span className="text-amber-400 font-semibold">{mediaStatus}</span>
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Dynamic Video Streaming Matrix Grid */}
        <div className="lg:col-span-3 space-y-4">
          {errorLog && (
            <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-xs font-medium">
              {errorLog}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Local Feed Display Window */}
            {localStreamRef.current && (
              <VideoBox
                stream={localStreamRef.current}
                label="Local Audio/Video Outbound"
                isLocal={true}
              />
            )}

            {/* 2. Automated Loop Iteration over dynamic Remote Feed array elements */}
            {remoteFeeds.map((feed) => (
              <VideoBox
                key={feed.userId} // Unique tracking anchored strictly to persistent userId
                videoTrack={feed.videoTrack}
                audioTrack={feed.audioTrack}
                label={`Remote ID: ${feed.userId.substring(0, 10)}...`}
                isLocal={false}
              />
            ))}
          </div>
        </div>

        {/* Console Logger Window column spacing */}
        <div className="lg:col-span-1 h-full">
          <LogConsole logs={logs} />
        </div>
      </main>
    </div>
  );
}
