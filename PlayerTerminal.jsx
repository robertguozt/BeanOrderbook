import React from "react";
import OrderBook from "../components/OrderBook.jsx";
import TradePanel from "../components/TradePanel.jsx";
import Inventory from "../components/Inventory.jsx";
import Timeline from "../components/Timeline.jsx";
import Tape from "../components/Tape.jsx";
import Panel from "../components/Panel.jsx";
import { computePnL } from "@shared/constants.js";
import { fmtMoney } from "@shared/utils.js";

export default function PlayerTerminal({ game }) {
  const { state, placeOrder } = game;
  const me = state.players.find((p) => p.id === state.me?.id) || state.me;
  const myPnL = me ? computePnL(me) : 0;

  const bestBid = state.book.bids[0]?.price ?? null;
  const bestAsk = state.book.asks[0]?.price ?? null;
  const lastTrade = state.trades[0];
  const mid = bestBid != null && bestAsk != null
    ? (bestBid + bestAsk) / 2
    : (lastTrade?.price ?? null);
  const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 p-3">
      <div className="flex flex-col gap-3">
        <Panel title="ORDER BOOK"
               badge={`${state.book.bids.length}b · ${state.book.asks.length}a`}>
          <OrderBook book={state.book} mid={mid} />
        </Panel>
        <Panel title="MARKET" small>
          <div className="grid grid-cols-5 gap-px bg-border">
            <Stat label="LAST" value={lastTrade ? `$${lastTrade.price.toFixed(2)}` : "—"} />
            <Stat label="BID"  value={bestBid != null ? `$${bestBid.toFixed(2)}` : "—"} color="text-green" />
            <Stat label="ASK"  value={bestAsk != null ? `$${bestAsk.toFixed(2)}` : "—"} color="text-red" />
            <Stat label="SPRD" value={spread != null ? `$${spread.toFixed(2)}` : "—"} color="text-amber" />
            <Stat label="MID"  value={mid != null ? `$${mid.toFixed(2)}` : "—"} />
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="TRADE TICKET">
          <TradePanel
            disabled={state.timer.phase !== "running"}
            bestBid={bestBid} bestAsk={bestAsk}
            onSubmit={placeOrder}
          />
        </Panel>
        <Panel title="INVENTORY">
          <Inventory me={me} myPnL={myPnL} />
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="ROUND TIMELINE">
          <Timeline timer={state.timer} announcements={state.announcements} />
        </Panel>
        <Panel title="TIME & SALES" badge={String(state.trades.length)}>
          <Tape trades={state.trades} mySocketId={null} />
        </Panel>
      </div>
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
