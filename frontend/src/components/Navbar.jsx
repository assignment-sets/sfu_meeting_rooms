import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { UserButton } from "@clerk/react";

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleChange = (e) => {
    navigate(e.target.value);
  };

  // Determine standard path value to match select value properly
  const currentValue = ["/", "/create-room"].includes(location.pathname)
    ? location.pathname
    : "/";

  return (
    <nav className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex justify-between items-center max-w-5xl mx-auto rounded-xl mb-8 shadow-md">
      <div className="flex items-center gap-4">
        <span className="text-xl font-bold text-indigo-400">AETHER App</span>
        <select
          value={currentValue}
          onChange={handleChange}
          className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="/">Home</option>
          <option value="/create-room">Create Room</option>
        </select>
      </div>
      <div>
        <UserButton afterSignOutUrl="/login" />
      </div>
    </nav>
  );
}
