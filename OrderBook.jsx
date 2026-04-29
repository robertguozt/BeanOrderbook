import React from "react";

export default function OrderBook({ book, mid }) {
  const asks = (book.asks || []).slice(0, 8).reverse();
  const bids = (book.bids || []).slice(0, 8);
  const allQty = [...asks, ...bids].map((o) => o.qty);
  const maxQty = Math.max(1, ...allQty);

  const Row = ({ side, level }) => {
    const w = (level.qty / maxQty) * 100;
    const color = side === "ask" ? "text-red" : "text-green";
    const bg = side === "ask" ? "bg-red" : "bg-green";
    return (
      <div className="relative flex px-2 py-1 text-[13px] tabular">
        <div
          className={`absolute top-0 bottom-0 ${bg} opacity-10 pointer-events-none ${side === "ask" ? "right-0" : "left-0"}`}
          style={{ width: `${w}%` }}
        />
        <div className="flex-1 text-left text-dim relative z-10">
          {level.mine > 0 && <span className="text-amber mr-1">●</span>}
          {level.qty}
        </div>
        <div className={`flex-1 text-right relative z-10 font-semibold ${color}`}>
          ${Number(level.price).toFixed(2)}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex justify-between text-[9px] text-dim tracking-widest px-2 py-1.5 border-b border-border">
        <span>SIZE</span><span>PRICE (ASKS)</span>
      </div>
      <div className="py-1">
        {asks.length === 0 && <div className="px-2 py-4 text-[11px] text-center text-dim">— no asks —</div>}
        {asks.map((o) => <Row key={"a" + o.price} side="ask" level={o} />)}
      </div>

      <div className="flex justify-between items-center px-3 py-2.5 bg-bg border-y border-border text-[13px] tracking-wide">
        <span className="text-dim">MID</span>
        <span className="text-amber font-bold tracking-widest">
          {mid != null ? `$${Number(mid).toFixed(2)}` : "—"}
        </span>
      </div>

      <div className="py-1">
        {bids.length === 0 && <div className="px-2 py-4 text-[11px] text-center text-dim">— no bids —</div>}
        {bids.map((o) => <Row key={"b" + o.price} side="bid" level={o} />)}
      </div>

      <div className="flex justify-between text-[9px] text-dim tracking-widest px-2 py-1.5 border-t border-border">
        <span>SIZE</span><span>PRICE (BIDS)</span>
      </div>
    </div>
  );
}
