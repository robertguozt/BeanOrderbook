import React from "react";
import { computePnL } from "@shared/constants.js";
import { fmtTime, fmtMoney } from "@shared/utils.js";

export default function Header({ me, timer }) {
  const phase = timer.phase || "lobby";
  const phaseColor =
    phase === "running" ? "text-green" :
    phase === "paused"  ? "text-amber" :
    phase === "ended"   ? "text-red"   : "text-dim";
  const phaseDot = phaseColor.replace("text-", "bg-");

  const myPnL = me ? computePnL(me) : 0;
  const remaining = timer.remaining ?? 0;

  return (
    <div className="flex items-center justify-between px-5 py-2.5 bg-panel border-b border-border sticky top-0 z-10">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 bg-amber text-[#1a1100] inline-flex items-center justify-center font-display text-sm">BX</span>
          <span className="font-display tracking-[0.25em] text-sm">BEAN&nbsp;EXCHANGE</span>
        </div>
        <span className="text-[11px] tracking-widest text-amber border border-amber px-2 py-1">
          {me?.isAdmin ? "ADMIN" : "TRADER"}
        </span>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2 text-[11px] tracking-widest px-3 py-1.5 border border-border">
          <span className={`w-2 h-2 rounded-full ${phaseDot}`} />
          <span className={`${phaseColor} font-semibold`}>{phase.toUpperCase()}</span>
        </div>
        <Clock label="ELAPSED" value={fmtTime(timer.elapsed || 0)} />
        <Clock label="REMAINING" value={fmtTime(remaining)}
               highlight={remaining < 60 && phase === "running"} />
        <div className="text-right border-l border-border pl-5">
          <div className="text-[9px] text-dim tracking-widest">{me?.name}</div>
          <div className={`text-lg font-bold tabular ${myPnL >= 0 ? "text-green" : "text-red"}`}>
            {fmtMoney(myPnL)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Clock({ label, value, highlight }) {
  return (
    <div className="text-right">
      <div className="text-[9px] text-dim tracking-widest">{label}</div>
      <div className={`text-lg font-semibold tabular ${highlight ? "text-red" : "text-fg"}`}>{value}</div>
    </div>
  );
}
