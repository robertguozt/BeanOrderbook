import React from "react";
import { fmtTime } from "@shared/utils.js";

export default function Ticker({ events, announcements }) {
  const items = [];
  for (const e of [...events].reverse()) {
    let txt = e.label;
    if (e.key === "ann1" && announcements.ann1 != null) txt += `: aggregate Σ = ${announcements.ann1}`;
    if (e.key === "ann2" && announcements.ann2 != null) txt += `: aggregate Σ = ${announcements.ann2}`;
    items.push(`[${fmtTime(e.firedAt ?? e.t)}] ${txt.toUpperCase()}`);
  }
  if (items.length === 0) {
    items.push("● MARKET STANDING BY · WAITING FOR ROUND TO BEGIN ·");
  }
  const stream = items.concat(items).join("   ◆   ");

  return (
    <div className="fixed bottom-0 left-0 right-0 h-8 bg-panel border-t border-border flex items-center overflow-hidden z-[5]">
      <div className="px-4 h-full flex items-center text-[10px] text-[#1a1100] bg-amber tracking-[0.25em] font-bold">
        WIRE
      </div>
      <div className="flex-1 overflow-hidden px-4">
        <div className="whitespace-nowrap animate-ticker text-[11px] text-dim tracking-widest">
          {stream}
        </div>
      </div>
    </div>
  );
}
