import React, { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, Navigate } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { useMediaSoup } from "../hooks/useMediaSoup";
import { LogConsole } from "../components/LogConsole";
import { Navbar } from "../components/Navbar";
import { MediaControls } from "../components/MediaControls";

const SIGNALING_SERVER_URL =
  import.meta.env.VITE_SIGNALING_SERVER_URL || "http://localhost:3000";

// Upgraded track-aware helper component to parse out raw audio/video streams cleanly
const VideoBox = ({ videoTrack, audioTrack, label, isLocal }) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  // Synchronize the Video Output Pipeline
  useEffect(() => {
    if (!videoRef.current) return;

    if (videoTrack) {
      // Extracts track context into a dynamic HTML element stream wrapper
      videoRef.current.srcObject = new MediaStream([videoTrack]);
      videoRef.current.play().catch((err) => {
        console.warn("[VideoBox] Autoplay video blocked:", err.message);
      });
    } else {
      videoRef.current.srcObject = null;
    }
  }, [videoTrack]);

  // Synchronize the Audio Output Pipeline
  useEffect(() => {
    // Only target remote tracks; local track playback causes acoustic feedback loops
    if (audioRef.current && audioTrack && !isLocal) {
      audioRef.current.srcObject = new MediaStream([audioTrack]);
      audioRef.current.play().catch((err) => {
        console.warn("[VideoBox] Autoplay audio blocked:", err.message);
      });
    }
  }, [audioTrack, isLocal]);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-lg flex flex-col items-center relative group">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block self-start">
        {label} {isLocal && "(You)"}
      </span>
      <div className="bg-slate-950 rounded-lg aspect-video w-full overflow-hidden flex items-center justify-center relative border border-slate-900">
        {videoTrack ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={true} // 🌟 FIX: Permanently mute the video element to completely bypass browser autoplay blocks
            className={`w-full h-full object-cover ${isLocal ? "scale-x-[-1]" : ""}`}
          />
        ) : (
          <div className="flex flex-col items-center space-y-2 text-slate-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-12 h-12"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
              />
            </svg>
            <span className="text-xs font-medium uppercase tracking-wider">
              Camera Off
            </span>
          </div>
        )}

        {/* Visual Audio Indicator Badge */}
        {audioTrack && (
          <div className="absolute bottom-2 right-2 bg-indigo-600/80 p-1.5 rounded-full text-white shadow">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-3.5 h-3.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
              />
            </svg>
          </div>
        )}

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
    startLocalTrack,
    stopLocalTrack,
  } = useMediaSoup(SIGNALING_SERVER_URL, roomId, token);

  // Derive active live track states out of the mediaStatus state
  const isVideoOn = ["Video Streaming", "Fully Active"].includes(mediaStatus);
  const isAudioOn = ["Audio Streaming", "Fully Active"].includes(mediaStatus);

  // Dynamic Trigger Event Methods mapping directly to Strategy 3 hooks
  const handleToggleVideo = async () => {
    if (isVideoOn) {
      await stopLocalTrack("video");
    } else {
      await startLocalTrack("video");
    }
  };

  const handleToggleAudio = async () => {
    if (isAudioOn) {
      await stopLocalTrack("audio");
    } else {
      await startLocalTrack("audio");
    }
  };

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

  // Derive active live tracks out of the local reference safely to pass down
  const localVideoTrack = isVideoOn
    ? localStreamRef.current?.getVideoTracks()[0]
    : null;
  const localAudioTrack = isAudioOn
    ? localStreamRef.current?.getAudioTracks()[0]
    : null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6 flex flex-col justify-between">
      <div>
        <Navbar />

        <header className="max-w-6xl mx-auto mb-6 border-b border-slate-800 pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-indigo-400">
              Meeting Workspace:{" "}
              <span className="text-sm font-mono text-slate-400 bg-slate-955 px-2 py-1 rounded select-all">
                {roomId}
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Status: Connection:{" "}
              <span className="text-emerald-400 font-semibold">
                {connectionStatus}
              </span>{" "}
              | Media Profile:{" "}
              <span className="text-amber-400 font-semibold">
                {mediaStatus}
              </span>
            </p>
          </div>
        </header>

        <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6 mb-24">
          {/* Dynamic Video Streaming Matrix Grid */}
          <div className="lg:col-span-3 space-y-4">
            {errorLog && (
              <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-xs font-medium">
                {errorLog}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1. Local Feed Display Window (Always available as a container grid tile) */}
              <VideoBox
                videoTrack={localVideoTrack}
                audioTrack={localAudioTrack}
                label="Local Stream Layout"
                isLocal={true}
              />

              {/* 2. Automated Loop Iteration over dynamic Remote Feed array elements */}
              {remoteFeeds.map((feed) => (
                <VideoBox
                  key={feed.userId}
                  videoTrack={feed.videoTrack}
                  audioTrack={feed.audioTrack}
                  label={`Remote User: ${feed.userId.substring(0, 10)}...`}
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

      {/* Floating Interactive Control Dashboard Dock */}
      <div className="fixed bottom-6 left-0 right-0 z-50 px-4">
        <MediaControls
          isVideoOn={isVideoOn}
          isAudioOn={isAudioOn}
          onToggleVideo={handleToggleVideo}
          onToggleAudio={handleToggleAudio}
        />
      </div>
    </div>
  );
}
