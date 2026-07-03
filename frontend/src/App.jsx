// frontend/src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@clerk/react";
import RoomPage from "./pages/RoomPage";

// Page imports from separate views
import EmptyHome from "./pages/EmptyHome";
import LoginPage from "./pages/LoginPage";
import MediaSoupEngine from "./pages/MediaSoupEngine";
import TestPage from "./pages/TestPage";
import CreateRoomPage from "./pages/CreateRoomPage";

function App() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <span className="text-indigo-400 animate-pulse font-medium">
          Verifying Session...
        </span>
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
          element={
            isSignedIn ? <EmptyHome /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/control-panel"
          element={
            isSignedIn ? <MediaSoupEngine /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/test"
          element={isSignedIn ? <TestPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/create-room"
          element={
            isSignedIn ? <CreateRoomPage /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/room/:roomId"
          element={isSignedIn ? <RoomPage /> : <LoginPage />}
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
