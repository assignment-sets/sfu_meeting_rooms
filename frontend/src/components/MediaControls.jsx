import React from "react";

export function MediaControls({
  isVideoOn,
  isAudioOn,
  onToggleVideo,
  onToggleAudio,
}) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-center space-x-4 shadow-xl max-w-md mx-auto">
      {/* Microphone Toggle Button */}
      <button
        onClick={onToggleAudio}
        className={`p-4 rounded-xl font-medium transition-all duration-200 flex items-center justify-center shadow-md border cursor-pointer ${
          isAudioOn
            ? "bg-slate-800 border-slate-700 text-indigo-400 hover:bg-slate-700"
            : "bg-rose-600 border-rose-500 text-white hover:bg-rose-700 animate-pulse"
        }`}
        title={isAudioOn ? "Mute Microphone" : "Unmute Microphone"}
      >
        {isAudioOn ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.822 7.822 3 3m-3-3-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
            />
          </svg>
        )}
      </button>

      {/* Camera Toggle Button */}
      <button
        onClick={onToggleVideo}
        className={`p-4 rounded-xl font-medium transition-all duration-200 flex items-center justify-center shadow-md border cursor-pointer ${
          isVideoOn
            ? "bg-slate-800 border-slate-700 text-indigo-400 hover:bg-slate-700"
            : "bg-rose-600 border-rose-500 text-white hover:bg-rose-700 animate-pulse"
        }`}
        title={isVideoOn ? "Stop Camera Video" : "Start Camera Video"}
      >
        {isVideoOn ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 0 1-2.25-2.25V9m12.841-1.591a2.25 2.25 0 0 0-2.25-2.159H4.5m1.5 1.5 3 3m4.774 4.774 3 3M3 3l18 18"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
