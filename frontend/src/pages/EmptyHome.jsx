import React from "react";
import { Navbar } from "../components/Navbar";

export default function EmptyHome() {
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
