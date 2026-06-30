// frontend/src/components/LogConsole.jsx
import React from 'react';

export const LogConsole = ({ logs }) => {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex-1 flex flex-col min-h-[400px] shadow-lg">
      <h2 className="text-lg font-bold border-b border-slate-700 pb-2 text-slate-200 mb-3">Live Log Diagnostics</h2>
      <div className="flex-1 overflow-y-auto max-h-[350px] space-y-2 font-mono text-xs">
        {logs.map((log, index) => (
          <div key={index} className="p-2 rounded bg-slate-950 border border-slate-900 flex items-start space-x-2">
            <span className="text-slate-500 shrink-0">{log.timestamp}</span>
            <span className={
              log.type === 'success' ? 'text-emerald-400 font-medium' :
              log.type === 'error' ? 'text-rose-400 font-medium' :
              log.type === 'warning' ? 'text-amber-400' : 'text-slate-300'
            }>
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
