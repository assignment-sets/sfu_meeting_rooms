import React from "react";
import { SignIn } from "@clerk/react";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-955 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl flex flex-col items-center">
        <h2 className="text-2xl font-bold text-indigo-400 mb-6">AETHER Auth Gateway</h2>
        <SignIn routing="path" path="/login" signUpUrl="/signup" />
      </div>
    </div>
  );
}
