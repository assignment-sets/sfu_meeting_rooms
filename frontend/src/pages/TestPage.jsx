import React, { useState } from "react";
import { Navbar } from "../components/Navbar";
import { useApi } from "../hooks/useApi";

export default function TestPage() {
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
