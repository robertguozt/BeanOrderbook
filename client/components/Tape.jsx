import React from "react";
import { socket } from "../lib/socket.js";

export default function Tape({ trades }) {
  if (!trades || trades.length === 0) {
    return <div className="px-2 py-4 text-center text-dim text-[11px]">No trades yet</div>;
  }
  const myId = socket.id;

  return (
    <div className="max-h-72 overflow-y-auto">
      {trades.slice(0, 30).map((t) => {
        const mine = t.buyerSocket === myId || t.sellerSocket === myId;
        const upTick = t.aggressor === "buy";
        return (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-1.5 py-1 text-xs tabular border-b border-border ${
              mine ? "bg-amber/5" : ""
            }`}
          >
            <span className="w-7 text-dim">{t.qty}</span>
            <span className={`flex-1 font-semibold ${upTick ? "text-green" : "text-red"}`}>
              ${Number(t.price).toFixed(2)}
            </span>
            <span className="text-[10px] text-dim">
              {mine ? "★ YOU" : upTick ? "↑" : "↓"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
