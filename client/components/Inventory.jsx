import React from "react";
import { BEAN_TARGET } from "@shared/constants.js";
import { fmtMoney } from "@shared/utils.js";

export default function Inventory({ me, myPnL }) {
  if (!me) return null;
  const dist = (me.beans ?? 0) - BEAN_TARGET;
  return (
    <div className="grid grid-cols-2 gap-px bg-border">
      <Stat label="CASH"          value={fmtMoney(me.cash)}
            color={me.cash >= 0 ? "text-fg" : "text-red"} />
      <Stat label="BEANS"         value={me.beans ?? 0} color="text-amber" />
      <Stat label="VS TARGET"     value={dist >= 0 ? `+${dist}` : dist}
            color={dist >= 0 ? "text-green" : "text-red"} />
      <Stat label="PROJECTED PnL" value={fmtMoney(myPnL)}
            color={myPnL >= 0 ? "text-green" : "text-red"} />
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="px-3 py-3 bg-panel text-center">
      <div className="text-[9px] text-dim tracking-widest mb-1">{label}</div>
      <div className={`text-base font-semibold tabular ${color}`}>{value}</div>
    </div>
  );
}
