import React from "react";
import { fmtTime } from "@shared/utils.js";

export default function Timeline({ timer, announcements }) {
  const events = timer.timeline || [];
  const elapsed = timer.elapsed || 0;

  return (
    <div className="flex flex-col">
      {events.map((ev, i) => {
        const fired = ev.fired;
        const isPast = elapsed >= ev.t;
        const isNow = !fired && elapsed < ev.t && (i === 0 || elapsed >= events[i - 1].t);
        return (
          <div key={ev.key} className="flex items-center gap-3 py-2 border-b border-border last:border-b-0">
            <div
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all ${
                fired ? "bg-amber" : isPast ? "bg-dim" : "bg-panel2"
              }`}
              style={isNow ? { boxShadow: "0 0 0 4px rgba(255,184,0,0.18)" } : {}}
            />
            <div className="text-xs text-dim w-12 tabular">{fmtTime(ev.t)}</div>
            <div className={`flex-1 text-xs flex justify-between items-center ${fired ? "text-fg" : "text-dim"}`}>
              {ev.label}
              {ev.key === "ann1" && announcements.ann1 != null && (
                <span className="text-amber text-[11px] font-bold px-2 py-0.5 border border-amber">Σ = {announcements.ann1}</span>
              )}
              {ev.key === "ann2" && announcements.ann2 != null && (
                <span className="text-amber text-[11px] font-bold px-2 py-0.5 border border-amber">Σ = {announcements.ann2}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
