import React, { useState, useEffect } from "react";

export default function Login({ onLogin, error, clearError }) {
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const isAdmin = name.trim().toLowerCase() === "admin";

  useEffect(() => { if (error) setTimeout(clearError, 4000); }, [error, clearError]);

  const submit = () => {
    if (!name.trim()) return;
    onLogin(name.trim(), pass);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#15201f_0%,#0a0e0f_60%)] p-6">
      <div className="w-full max-w-md p-10 bg-panel border border-border shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-amber text-[#1a1100] flex items-center justify-center font-display text-xl">BX</div>
          <div>
            <div className="font-display text-xl tracking-[0.2em]">BEAN&nbsp;EXCHANGE</div>
            <div className="text-[11px] text-dim tracking-widest mt-1">Terminal v1.0 — Trading Floor</div>
          </div>
        </div>

        <div className="mt-8">
          <label className="block text-[10px] text-dim tracking-widest mb-2">OPERATOR ID</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (isAdmin ? submit() : submit())}
            placeholder="Enter your name (or 'admin')"
            className="w-full px-4 py-3 bg-bg border border-border text-fg outline-none tracking-wide"
          />

          {isAdmin && (
            <>
              <label className="block text-[10px] text-dim tracking-widest mb-2 mt-4">ADMIN PASSWORD</label>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full px-4 py-3 bg-bg border border-border text-fg outline-none tracking-wide"
              />
            </>
          )}

          <button
            onClick={submit}
            className="w-full px-4 py-3 mt-4 bg-amber text-[#1a1100] tracking-[0.2em] text-xs font-bold"
          >
            ENTER FLOOR &rarr;
          </button>

          {error && (
            <div className="mt-4 px-3 py-2 border border-red text-red text-xs">{error}</div>
          )}
        </div>

        <div className="mt-8 pt-5 border-t border-border text-[10px] text-dim leading-relaxed tracking-wide">
          <div>OBJECTIVE&nbsp;&nbsp;Hold ≥100 beans at close. Each bean short = −$1.</div>
          <div className="mt-1">ROUND&nbsp;&nbsp;10:00 with two private distributions and two aggregate announcements.</div>
        </div>
      </div>
    </div>
  );
}
