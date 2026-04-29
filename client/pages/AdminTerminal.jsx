import React, { useState, useEffect } from "react";
import Panel from "../components/Panel.jsx";
import Timeline from "../components/Timeline.jsx";
import { computePnL } from "@shared/constants.js";
import { fmtMoney } from "@shared/utils.js";

export default function AdminTerminal({ game }) {
  const { state, adminStart, adminPause, adminReset, adminConfig } = game;
  const players = state.players;
  const totalBeans = players.reduce((s, p) => s + p.beans, 0);
  const totalCash  = players.reduce((s, p) => s + p.cash, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 p-3">
      <div className="flex flex-col gap-3">
        <Panel title="GAME CONTROL">
          <div className="grid gap-2">
            {(state.timer.phase === "lobby" || state.timer.phase === "ended") ? (
              <button onClick={adminStart}
                className="p-4 bg-green text-[#031507] tracking-[0.2em] font-bold">
                ▶ START ROUND
              </button>
            ) : (
              <button onClick={adminPause}
                className="p-4 bg-amber text-[#1a1100] tracking-[0.2em] font-bold">
                {state.timer.phase === "running" ? "❚❚ PAUSE" : "▶ RESUME"}
              </button>
            )}
            <button onClick={adminReset}
              className="p-4 bg-red text-white tracking-[0.2em] font-bold">
              ↺ RESET
            </button>
          </div>
        </Panel>

        <Panel title="CONFIGURATION">
          <ConfigForm config={state.timer.config} onApply={adminConfig} />
        </Panel>

        <Panel title="ROUND TIMELINE">
          <Timeline timer={state.timer} announcements={state.announcements} />
        </Panel>
      </div>

      <div className="lg:col-span-2 flex flex-col gap-3">
        <Panel title="MARKET POSITIONS" badge={`${players.length} agents`}>
          <Positions players={players} />
          <div className="grid grid-cols-4 gap-px mt-4 bg-border">
            <Stat label="TOTAL BEANS" value={totalBeans} />
            <Stat label="TOTAL CASH"  value={fmtMoney(totalCash)} />
            <Stat label="ANN 1" value={state.announcements.ann1 ?? "—"} />
            <Stat label="ANN 2" value={state.announcements.ann2 ?? "—"} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Positions({ players }) {
  const sorted = [...players].sort((a, b) => computePnL(b) - computePnL(a));
  return (
    <div>
      <div className="flex px-1 py-2 text-[9px] text-dim tracking-widest border-b border-border">
        <span className="w-8">#</span>
        <span className="flex-[2]">NAME</span>
        <span className="flex-1 text-right">BEANS</span>
        <span className="flex-1 text-right">CASH</span>
        <span className="flex-1 text-right">PnL</span>
      </div>
      {sorted.map((p, i) => {
        const pnl = computePnL(p);
        return (
          <div key={p.id} className="flex px-1 py-2.5 text-sm tabular border-b border-border items-center">
            <span className="w-8 text-dim">{i + 1}</span>
            <span className="flex-[2] font-bold">
              {p.name}{!p.connected && <span className="text-dim ml-2">(off)</span>}
            </span>
            <span className="flex-1 text-right text-amber">{p.beans}</span>
            <span className="flex-1 text-right">{fmtMoney(p.cash)}</span>
            <span className={`flex-1 text-right font-semibold ${pnl >= 0 ? "text-green" : "text-red"}`}>
              {fmtMoney(pnl)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ConfigForm({ config, onApply }) {
  const [local, setLocal] = useState(config);
  useEffect(() => setLocal(config), [config]);

  const Field = ({ label, k }) => (
    <div className="mb-3">
      <label className="block text-[9px] text-dim tracking-widest mb-1">{label}</label>
      <input
        type="number"
        value={local[k] ?? 0}
        onChange={(e) => setLocal({ ...local, [k]: Number(e.target.value) })}
        className="w-full px-3 py-2 bg-bg border border-border text-fg outline-none tabular"
      />
    </div>
  );

  return (
    <div>
      <Field label="DIST MIN (per player)" k="distMin" />
      <Field label="DIST MAX (per player)" k="distMax" />
      <Field label="ROUND LENGTH (sec)"    k="roundLength" />
      <button
        onClick={() => onApply(local)}
        className="w-full px-3 py-2 bg-amber text-[#1a1100] text-xs tracking-widest font-bold"
      >APPLY CONFIG</button>
    </div>
  );
}

function Stat({ label, value, color = "text-fg" }) {
  return (
    <div className="px-3 py-2.5 bg-panel text-center">
      <div className="text-[9px] text-dim tracking-widest mb-1">{label}</div>
      <div className={`text-base font-semibold tabular ${color}`}>{value}</div>
    </div>
  );
}
