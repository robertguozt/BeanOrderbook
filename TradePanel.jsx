import React, { useEffect, useState } from "react";

export default function TradePanel({ disabled, bestBid, bestAsk, onSubmit }) {
  const [side, setSide] = useState("buy");
  const [type, setType] = useState("limit");
  const [price, setPrice] = useState("0.50");
  const [qty, setQty] = useState("10");

  // Auto-suggest price from current top of book when switching side / type
  useEffect(() => {
    if (type !== "limit") return;
    if (side === "buy"  && bestAsk != null) setPrice(Number(bestAsk).toFixed(2));
    if (side === "sell" && bestBid != null) setPrice(Number(bestBid).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, type]);

  const submit = () => {
    const q = parseInt(qty, 10);
    const p = parseFloat(price);
    if (!q || q <= 0) return;
    if (type === "limit" && (!p || p <= 0)) return;
    onSubmit({
      side,
      price: type === "market" ? 0 : p,
      qty: q,
      isMarket: type === "market",
    });
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-px bg-border mb-3">
        <button
          onClick={() => setSide("buy")}
          className={`p-2.5 text-[11px] tracking-widest font-semibold ${
            side === "buy" ? "bg-green text-[#031507]" : "bg-panel2 text-dim"
          }`}
        >BUY / LONG</button>
        <button
          onClick={() => setSide("sell")}
          className={`p-2.5 text-[11px] tracking-widest font-semibold ${
            side === "sell" ? "bg-red text-white" : "bg-panel2 text-dim"
          }`}
        >SELL / SHORT</button>
      </div>

      <div className="flex gap-1 mb-3.5">
        <button onClick={() => setType("limit")}
          className={`flex-1 p-1.5 text-[10px] tracking-widest border ${
            type === "limit" ? "border-amber text-amber" : "border-border text-dim"
          }`}>LIMIT</button>
        <button onClick={() => setType("market")}
          className={`flex-1 p-1.5 text-[10px] tracking-widest border ${
            type === "market" ? "border-amber text-amber" : "border-border text-dim"
          }`}>MARKET</button>
      </div>

      <Field label="PRICE">
        <input
          value={type === "market" ? "MKT" : price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={type === "market"}
          inputMode="decimal"
          className="w-full px-3 py-2.5 bg-bg border border-border text-fg outline-none tabular disabled:opacity-50"
        />
      </Field>

      <Field label="QUANTITY">
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="numeric"
          className="w-full px-3 py-2.5 bg-bg border border-border text-fg outline-none tabular"
        />
      </Field>

      <button
        onClick={submit}
        disabled={disabled}
        className={`w-full p-3 mt-2 text-[11px] tracking-widest font-bold ${
          disabled ? "bg-panel2 text-dim cursor-not-allowed"
                   : side === "buy"  ? "bg-green text-[#031507]"
                                     : "bg-red text-white"
        }`}
      >
        {disabled ? "MARKET CLOSED" : `SUBMIT ${side.toUpperCase()} ${type.toUpperCase()}`}
      </button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-[9px] text-dim tracking-widest mb-1">{label}</label>
      {children}
    </div>
  );
}
