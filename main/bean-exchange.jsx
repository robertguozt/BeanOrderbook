import React, { useState, useEffect, useRef, useReducer, useCallback } from "react";

// ============================================================================
// BEAN EXCHANGE — Single-file simulator
// ----------------------------------------------------------------------------
// This is a self-contained version of the system specified in the technical
// plan. The matching engine, game timer, distribution events, and bot players
// all run client-side. In the deployed version, the engine and timer would
// live on the Node/Socket.io server; the wire format here is structured so
// the same actions could be passed through a WebSocket without modification.
// ============================================================================

// ---------- Constants ----------
const BEAN_TARGET = 100;
const TIMELINE = [
  { t: 0,   key: "open",     label: "Market Opens" },
  { t: 120, key: "dist1",    label: "Distribution 1" },
  { t: 300, key: "ann1",     label: "Announcement 1" },
  { t: 360, key: "dist2",    label: "Distribution 2" },
  { t: 540, key: "ann2",     label: "Announcement 2" },
  { t: 600, key: "close",    label: "Market Closes" },
];
const ROUND_LENGTH = 600; // 10:00

// ---------- Utilities ----------
const fmtTime = (s) => {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};
const fmtMoney = (n) => {
  const v = Number(n);
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
};
const uid = () => Math.random().toString(36).slice(2, 10);
const randU = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(randU(a, b + 1));

// ---------- Matching Engine (Price-Time Priority / FIFO) ----------
// Keeps two sorted books. Returns the new state plus a list of fills.
const initialBook = () => ({ bids: [], asks: [] });

function insertSorted(book, side, order) {
  const arr = [...book[side]];
  // bids descending by price, asks ascending; ties broken by time (older first)
  const cmp = (a, b) => {
    if (side === "bids") {
      if (b.price !== a.price) return b.price - a.price;
    } else {
      if (a.price !== b.price) return a.price - b.price;
    }
    return a.ts - b.ts;
  };
  let i = 0;
  while (i < arr.length && cmp(arr[i], order) <= 0) i++;
  arr.splice(i, 0, order);
  return { ...book, [side]: arr };
}

function matchOrder(book, incoming, players) {
  // incoming: { id, owner, side: 'buy'|'sell', price, qty, isMarket, ts }
  let remaining = incoming.qty;
  const fills = [];
  // copy each resting order so we can mutate qty safely
  const bids = book.bids.map(o => ({ ...o }));
  const asks = book.asks.map(o => ({ ...o }));
  const opposite = incoming.side === "buy" ? asks : bids;
  const sameBook = incoming.side === "buy" ? bids : asks;
  const skipped = []; // self-trades we'll re-insert at the end

  while (remaining > 0 && opposite.length > 0) {
    const top = opposite[0];
    const priceOk = incoming.isMarket
      || (incoming.side === "buy"  ? incoming.price >= top.price
                                   : incoming.price <= top.price);
    if (!priceOk) break;
    if (top.owner === incoming.owner) {
      // self-cross: pull the resting order aside and try the next one
      skipped.push(opposite.shift());
      continue;
    }
    const fillQty = Math.min(remaining, top.qty);
    const fillPrice = top.price; // executes at resting price
    fills.push({
      id: uid(),
      ts: incoming.ts,
      buyer:  incoming.side === "buy"  ? incoming.owner : top.owner,
      seller: incoming.side === "sell" ? incoming.owner : top.owner,
      price: fillPrice,
      qty: fillQty,
      aggressor: incoming.side,
    });
    top.qty -= fillQty;
    remaining -= fillQty;
    if (top.qty === 0) opposite.shift();
  }
  // restore any orders we skipped due to self-cross protection
  for (const s of skipped) opposite.push(s);

  let newBook = incoming.side === "buy"
    ? { bids: sameBook, asks: opposite }
    : { bids: opposite, asks: sameBook };

  // re-sort the side we may have disturbed
  const reSortKey = incoming.side === "buy" ? "asks" : "bids";
  newBook[reSortKey] = newBook[reSortKey].sort((a, b) => {
    if (reSortKey === "bids") {
      if (b.price !== a.price) return b.price - a.price;
    } else {
      if (a.price !== b.price) return a.price - b.price;
    }
    return a.ts - b.ts;
  });

  if (remaining > 0 && !incoming.isMarket) {
    newBook = insertSorted(newBook, incoming.side === "buy" ? "bids" : "asks", {
      ...incoming, qty: remaining,
    });
  }
  return { newBook, fills, leftover: remaining };
}

// Apply fills to player balances
function applyFills(players, fills) {
  const next = { ...players };
  for (const f of fills) {
    if (next[f.buyer]) {
      next[f.buyer] = {
        ...next[f.buyer],
        cash:  next[f.buyer].cash  - f.price * f.qty,
        beans: next[f.buyer].beans + f.qty,
      };
    }
    if (next[f.seller]) {
      next[f.seller] = {
        ...next[f.seller],
        cash:  next[f.seller].cash  + f.price * f.qty,
        beans: next[f.seller].beans - f.qty,
      };
    }
  }
  return next;
}

// ---------- PnL ----------
function computePnL(player) {
  const shortfall = Math.min(0, (player.beans - BEAN_TARGET) * 1);
  return player.cash + shortfall;
}

// ---------- Game state reducer ----------
const initialState = () => ({
  phase: "lobby",       // lobby | running | paused | ended
  elapsed: 0,
  book: initialBook(),
  trades: [],           // recent fills, newest first
  events: [],           // game timeline events fired
  players: {},          // id -> { id, name, isBot, cash, beans }
  announcements: { ann1: null, ann2: null },
  config: { distMin: 0, distMax: 100, roundLength: ROUND_LENGTH },
  myId: null,
  adminMode: false,
});

function reducer(state, action) {
  switch (action.type) {
    case "ADD_PLAYER": {
      const p = action.player;
      return { ...state, players: { ...state.players, [p.id]: p } };
    }
    case "SET_ME": {
      return { ...state, myId: action.id, adminMode: action.admin };
    }
    case "START": {
      return { ...state, phase: "running", elapsed: 0, events: [] };
    }
    case "PAUSE": {
      return { ...state, phase: state.phase === "running" ? "paused" : "running" };
    }
    case "RESET": {
      const fresh = initialState();
      // keep my identity & player roster but reset balances
      const players = {};
      for (const id of Object.keys(state.players)) {
        players[id] = { ...state.players[id], cash: 0, beans: 0 };
      }
      return { ...fresh, players, myId: state.myId, adminMode: state.adminMode, config: state.config };
    }
    case "TICK": {
      return { ...state, elapsed: Math.min(state.elapsed + 1, state.config.roundLength) };
    }
    case "FIRE_EVENT": {
      const ev = action.event;
      const events = [...state.events, ev];
      let players = state.players;
      let announcements = state.announcements;
      if (ev.key === "dist1" || ev.key === "dist2") {
        const next = { ...players };
        let total = 0;
        for (const id of Object.keys(next)) {
          const x = randInt(state.config.distMin, state.config.distMax);
          total += x;
          next[id] = { ...next[id], beans: next[id].beans + x };
        }
        players = next;
        // store the aggregate to be revealed at announcement time
        announcements = { ...announcements, [ev.key === "dist1" ? "_pending1" : "_pending2"]: total };
      }
      if (ev.key === "ann1") {
        announcements = { ...announcements, ann1: announcements._pending1 ?? 0 };
      }
      if (ev.key === "ann2") {
        announcements = { ...announcements, ann2: announcements._pending2 ?? 0 };
      }
      let phase = state.phase;
      if (ev.key === "close") phase = "ended";
      return { ...state, events, players, announcements, phase };
    }
    case "PLACE_ORDER": {
      if (state.phase !== "running") return state;
      const o = action.order;
      const owner = state.players[o.owner];
      if (!owner) return state;
      const { newBook, fills } = matchOrder(state.book, o, state.players);
      const players = applyFills(state.players, fills);
      const trades = [...fills.reverse(), ...state.trades].slice(0, 100);
      return { ...state, book: newBook, trades, players };
    }
    case "CANCEL_ORDER": {
      const { id, side } = action;
      return {
        ...state,
        book: { ...state.book, [side]: state.book[side].filter((o) => o.id !== id) },
      };
    }
    case "UPDATE_CONFIG": {
      return { ...state, config: { ...state.config, ...action.config } };
    }
    default: return state;
  }
}

// ============================================================================
// React UI
// ============================================================================

const seedPlayers = () => {
  const me = { id: "me", name: "You", isBot: false, cash: 0, beans: 0 };
  const players = { [me.id]: me };
  return { players, myId: "me" };
};

export default function BeanExchange() {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const init = initialState();
    const seed = seedPlayers();
    return { ...init, players: seed.players, myId: seed.myId };
  });

  const [tab, setTab] = useState("trade"); // trade | admin
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [loginName, setLoginName] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  // Game tick
  useEffect(() => {
    if (state.phase !== "running") return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  // Fire timeline events when elapsed crosses a boundary
  useEffect(() => {
    if (state.phase !== "running" && state.phase !== "ended") return;
    for (const ev of TIMELINE) {
      const fired = state.events.find((e) => e.key === ev.key);
      if (!fired && state.elapsed >= ev.t) {
        dispatch({ type: "FIRE_EVENT", event: { ...ev, firedAt: state.elapsed } });
      }
    }
  }, [state.elapsed, state.phase, state.events]);



  const me = state.players[state.myId];
  const myPnL = me ? computePnL(me) : 0;
  const remaining = Math.max(0, state.config.roundLength - state.elapsed);

  // ---- Login screen ----
  if (!loggedIn) {
    return <LoginScreen
      onLogin={(name) => {
        const isAdmin = name.trim().toLowerCase() === "admin";
        if (isAdmin) {
          setAdminUnlocked(true);
          setTab("admin");
          dispatch({ type: "SET_ME", id: state.myId, admin: true });
        } else {
          // rename "You" to whatever they typed
          dispatch({
            type: "ADD_PLAYER",
            player: { ...state.players[state.myId], name: name.trim() || "You" },
          });
        }
        setLoggedIn(true);
      }}
      name={loginName}
      setName={setLoginName}
    />;
  }

  return (
    <div style={styles.app}>
      <style>{globalCSS}</style>

      <Header
        elapsed={state.elapsed}
        remaining={remaining}
        phase={state.phase}
        adminUnlocked={adminUnlocked}
        tab={tab}
        setTab={setTab}
        myName={me?.name}
        myPnL={myPnL}
      />

      {tab === "trade" ? (
        <TradeView state={state} dispatch={dispatch} me={me} myPnL={myPnL} />
      ) : (
        <AdminView state={state} dispatch={dispatch} />
      )}

      <Ticker events={state.events} announcements={state.announcements} />
    </div>
  );
}

// ============================================================================
// Login
// ============================================================================
function LoginScreen({ onLogin, name, setName }) {
  return (
    <div style={styles.loginWrap}>
      <style>{globalCSS}</style>
      <div style={styles.loginCard}>
        <div style={styles.loginBrand}>
          <div style={styles.loginLogo}>BX</div>
          <div>
            <div style={styles.loginTitle}>BEAN&nbsp;EXCHANGE</div>
            <div style={styles.loginSub}>Terminal v1.0 — Trading Floor</div>
          </div>
        </div>

        <div style={{ marginTop: 32 }}>
          <div style={styles.loginLabel}>OPERATOR ID</div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onLogin(name)}
            placeholder="Enter your name (or 'admin')"
            style={styles.loginInput}
          />
          <button onClick={() => onLogin(name)} style={styles.loginBtn}>
            ENTER FLOOR &rarr;
          </button>
        </div>

        <div style={styles.loginFoot}>
          <div>OBJECTIVE&nbsp;&nbsp;Hold ≥100 beans at close. Each bean short = −$1.</div>
          <div style={{ marginTop: 4 }}>ROUND&nbsp;&nbsp;10:00 with two private distributions and two aggregate announcements.</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Header
// ============================================================================
function Header({ elapsed, remaining, phase, adminUnlocked, tab, setTab, myName, myPnL }) {
  const phaseColor = phase === "running" ? "var(--green)"
                    : phase === "paused"  ? "var(--amber)"
                    : phase === "ended"   ? "var(--red)"
                    : "var(--dim)";
  return (
    <div style={styles.header}>
      <div style={styles.headerLeft}>
        <div style={styles.brand}>
          <span style={styles.brandLogo}>BX</span>
          <span style={styles.brandText}>BEAN&nbsp;EXCHANGE</span>
        </div>
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === "trade" ? styles.tabActive : {}) }}
            onClick={() => setTab("trade")}
          >TRADING TERMINAL</button>
          {adminUnlocked && (
            <button
              style={{ ...styles.tab, ...(tab === "admin" ? styles.tabActive : {}) }}
              onClick={() => setTab("admin")}
            >ADMIN</button>
          )}
        </div>
      </div>

      <div style={styles.headerRight}>
        <div style={styles.statusPill}>
          <span style={{ ...styles.dot, background: phaseColor }} />
          <span style={{ color: phaseColor, fontWeight: 600 }}>{phase.toUpperCase()}</span>
        </div>
        <div style={styles.clock}>
          <div style={styles.clockLabel}>ELAPSED</div>
          <div style={styles.clockTime}>{fmtTime(elapsed)}</div>
        </div>
        <div style={styles.clock}>
          <div style={styles.clockLabel}>REMAINING</div>
          <div style={{ ...styles.clockTime, color: remaining < 60 && phase === "running" ? "var(--red)" : "var(--fg)" }}>
            {fmtTime(remaining)}
          </div>
        </div>
        <div style={styles.userBlock}>
          <div style={styles.userLabel}>{myName}</div>
          <div style={{ ...styles.userPnL, color: myPnL >= 0 ? "var(--green)" : "var(--red)" }}>
            {fmtMoney(myPnL)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TRADE VIEW
// ============================================================================
function TradeView({ state, dispatch, me, myPnL }) {
  const myOpenOrders = [
    ...state.book.bids.filter((o) => o.owner === state.myId).map((o) => ({ ...o, side: "buy" })),
    ...state.book.asks.filter((o) => o.owner === state.myId).map((o) => ({ ...o, side: "sell" })),
  ];

  const lastTrade = state.trades[0];
  const bestBid = state.book.bids[0]?.price ?? null;
  const bestAsk = state.book.asks[0]?.price ?? null;
  const mid = bestBid && bestAsk ? ((bestBid + bestAsk) / 2) : (lastTrade?.price ?? null);
  const spread = bestBid && bestAsk ? (bestAsk - bestBid) : null;

  return (
    <div style={styles.grid}>
      {/* LEFT COLUMN: book + trades */}
      <div style={styles.col}>
        <Panel title="ORDER BOOK" badge={`${state.book.bids.length}b · ${state.book.asks.length}a`}>
          <OrderBook book={state.book} mid={mid} myId={state.myId} />
        </Panel>
        <Panel title="MARKET" small>
          <div style={styles.marketRow}>
            <Stat label="LAST" value={lastTrade ? `$${lastTrade.price.toFixed(2)}` : "—"} />
            <Stat label="BID" value={bestBid != null ? `$${bestBid.toFixed(2)}` : "—"} color="var(--green)" />
            <Stat label="ASK" value={bestAsk != null ? `$${bestAsk.toFixed(2)}` : "—"} color="var(--red)" />
            <Stat label="SPRD" value={spread != null ? `$${spread.toFixed(2)}` : "—"} color="var(--amber)" />
            <Stat label="MID" value={mid != null ? `$${mid.toFixed(2)}` : "—"} />
          </div>
        </Panel>
      </div>

      {/* MIDDLE COLUMN: trade panel + inventory */}
      <div style={styles.col}>
        <Panel title="TRADE TICKET">
          <TradePanel
            state={state}
            dispatch={dispatch}
            bestBid={bestBid}
            bestAsk={bestAsk}
            disabled={state.phase !== "running"}
          />
        </Panel>
        <Panel title="INVENTORY">
          <Inventory me={me} myPnL={myPnL} />
        </Panel>
        <Panel title="MY OPEN ORDERS" badge={String(myOpenOrders.length)}>
          <MyOrders
            orders={myOpenOrders}
            onCancel={(o) => dispatch({ type: "CANCEL_ORDER", id: o.id, side: o.side === "buy" ? "bids" : "asks" })}
          />
        </Panel>
      </div>

      {/* RIGHT COLUMN: timeline + tape */}
      <div style={styles.col}>
        <Panel title="ROUND TIMELINE">
          <Timeline elapsed={state.elapsed} events={state.events} announcements={state.announcements} />
        </Panel>
        <Panel title="TIME & SALES" badge={String(state.trades.length)}>
          <Tape trades={state.trades} myId={state.myId} />
        </Panel>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN VIEW
// ============================================================================
function AdminView({ state, dispatch }) {
  const players = Object.values(state.players);
  const totalBeans = players.reduce((s, p) => s + p.beans, 0);
  const totalCash = players.reduce((s, p) => s + p.cash, 0);

  return (
    <div style={styles.grid}>
      <div style={styles.col}>
        <Panel title="GAME CONTROL">
          <div style={styles.adminButtons}>
            {state.phase === "lobby" || state.phase === "ended" ? (
              <button style={{ ...styles.bigBtn, background: "var(--green)", color: "#031507" }}
                onClick={() => dispatch({ type: "START" })}>
                ▶ START ROUND
              </button>
            ) : (
              <button style={{ ...styles.bigBtn, background: "var(--amber)", color: "#1a1100" }}
                onClick={() => dispatch({ type: "PAUSE" })}>
                {state.phase === "running" ? "❚❚ PAUSE" : "▶ RESUME"}
              </button>
            )}
            <button style={{ ...styles.bigBtn, background: "var(--red)", color: "#fff" }}
              onClick={() => dispatch({ type: "RESET" })}>
              ↺ RESET
            </button>
          </div>
        </Panel>

        <Panel title="CONFIGURATION">
          <ConfigForm config={state.config}
            onChange={(c) => dispatch({ type: "UPDATE_CONFIG", config: c })}
          />
        </Panel>
      </div>

      <div style={{ ...styles.col, gridColumn: "span 2" }}>
        <Panel title="MARKET POSITIONS" badge={`${players.length} agents`}>
          <PositionsTable players={players} />
          <div style={styles.totalsRow}>
            <Stat label="TOTAL BEANS" value={totalBeans} />
            <Stat label="TOTAL CASH" value={fmtMoney(totalCash)} />
            <Stat label="ANN 1" value={state.announcements.ann1 ?? "—"} />
            <Stat label="ANN 2" value={state.announcements.ann2 ?? "—"} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================
function Panel({ title, badge, small, children }) {
  return (
    <div style={styles.panel}>
      <div style={styles.panelHead}>
        <span style={styles.panelTitle}>{title}</span>
        {badge && <span style={styles.panelBadge}>{badge}</span>}
      </div>
      <div style={{ ...styles.panelBody, ...(small ? { padding: 8 } : {}) }}>{children}</div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color: color || "var(--fg)" }}>{value}</div>
    </div>
  );
}

function OrderBook({ book, mid, myId }) {
  // Aggregate by price level for display
  const aggregate = (orders) => {
    const map = new Map();
    for (const o of orders) {
      map.set(o.price, (map.get(o.price) || 0) + o.qty);
    }
    return [...map.entries()].map(([price, qty]) => ({ price, qty }));
  };
  const asks = aggregate(book.asks).slice(0, 8).reverse(); // best ask at bottom of asks list visually
  const bids = aggregate(book.bids).slice(0, 8);
  const maxQty = Math.max(1, ...asks.map(o => o.qty), ...bids.map(o => o.qty));

  const Row = ({ side, price, qty }) => {
    const w = (qty / maxQty) * 100;
    const color = side === "ask" ? "var(--red)" : "var(--green)";
    const myQty = book[side === "ask" ? "asks" : "bids"]
      .filter(o => o.price === price && o.owner === myId)
      .reduce((s, o) => s + o.qty, 0);
    return (
      <div style={styles.bookRow}>
        <div style={{ ...styles.bookFill, width: `${w}%`, background: color, opacity: 0.12,
                      [side === "ask" ? "right" : "left"]: 0 }} />
        <div style={{ ...styles.bookCell, textAlign: "left", color: "var(--dim)" }}>
          {myQty > 0 && <span style={styles.myMark}>●</span>}
          {qty}
        </div>
        <div style={{ ...styles.bookCell, textAlign: "right", color, fontWeight: 600 }}>
          ${price.toFixed(2)}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={styles.bookHeader}>
        <span>SIZE</span><span>PRICE (ASKS)</span>
      </div>
      <div style={styles.bookSection}>
        {asks.length === 0 && <div style={styles.bookEmpty}>— no asks —</div>}
        {asks.map((o) => <Row key={"a" + o.price} side="ask" {...o} />)}
      </div>
      <div style={styles.spreadRow}>
        <span style={{ color: "var(--dim)" }}>MID</span>
        <span style={{ color: "var(--amber)", fontWeight: 700, letterSpacing: 1 }}>
          {mid != null ? `$${mid.toFixed(2)}` : "—"}
        </span>
      </div>
      <div style={styles.bookSection}>
        {bids.length === 0 && <div style={styles.bookEmpty}>— no bids —</div>}
        {bids.map((o) => <Row key={"b" + o.price} side="bid" {...o} />)}
      </div>
      <div style={{ ...styles.bookHeader, borderTop: "1px solid var(--border)", borderBottom: "none" }}>
        <span>SIZE</span><span>PRICE (BIDS)</span>
      </div>
    </div>
  );
}

function TradePanel({ state, dispatch, bestBid, bestAsk, disabled }) {
  const [side, setSide] = useState("buy");
  const [type, setType] = useState("limit");
  const [price, setPrice] = useState("0.50");
  const [qty, setQty] = useState("10");

  // auto-suggest price from book
  useEffect(() => {
    if (type !== "limit") return;
    if (side === "buy"  && bestAsk != null) setPrice(bestAsk.toFixed(2));
    if (side === "sell" && bestBid != null) setPrice(bestBid.toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, type]);

  const submit = () => {
    const q = parseInt(qty, 10);
    const p = parseFloat(price);
    if (!q || q <= 0) return;
    if (type === "limit" && (!p || p <= 0)) return;
    dispatch({
      type: "PLACE_ORDER",
      order: {
        id: uid(),
        owner: state.myId,
        side,
        price: type === "market" ? (side === "buy" ? Infinity : 0) : p,
        qty: q,
        isMarket: type === "market",
        ts: Date.now(),
      },
    });
  };

  return (
    <div>
      <div style={styles.sideToggle}>
        <button
          onClick={() => setSide("buy")}
          style={{ ...styles.sideBtn, ...(side === "buy" ? styles.sideBuy : {}) }}
        >BUY / LONG</button>
        <button
          onClick={() => setSide("sell")}
          style={{ ...styles.sideBtn, ...(side === "sell" ? styles.sideSell : {}) }}
        >SELL / SHORT</button>
      </div>

      <div style={styles.typeToggle}>
        <button onClick={() => setType("limit")}
          style={{ ...styles.typeBtn, ...(type === "limit" ? styles.typeActive : {}) }}>LIMIT</button>
        <button onClick={() => setType("market")}
          style={{ ...styles.typeBtn, ...(type === "market" ? styles.typeActive : {}) }}>MARKET</button>
      </div>

      <div style={styles.field}>
        <label style={styles.fieldLabel}>PRICE</label>
        <input
          value={type === "market" ? "MKT" : price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={type === "market"}
          style={styles.input}
          inputMode="decimal"
        />
      </div>
      <div style={styles.field}>
        <label style={styles.fieldLabel}>QUANTITY</label>
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          style={styles.input}
          inputMode="numeric"
        />
      </div>

      <button
        onClick={submit}
        disabled={disabled}
        style={{
          ...styles.submitBtn,
          background: disabled ? "var(--panel-2)" : (side === "buy" ? "var(--green)" : "var(--red)"),
          color: disabled ? "var(--dim)" : (side === "buy" ? "#031507" : "#fff"),
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {disabled ? "MARKET CLOSED" : `SUBMIT ${side.toUpperCase()} ${type.toUpperCase()}`}
      </button>
    </div>
  );
}

function Inventory({ me, myPnL }) {
  if (!me) return null;
  const dist = me.beans - BEAN_TARGET;
  return (
    <div style={styles.invGrid}>
      <Stat label="CASH" value={fmtMoney(me.cash)} color={me.cash >= 0 ? "var(--fg)" : "var(--red)"} />
      <Stat label="BEANS" value={me.beans} color="var(--amber)" />
      <Stat label="VS TARGET" value={dist >= 0 ? `+${dist}` : `${dist}`} color={dist >= 0 ? "var(--green)" : "var(--red)"} />
      <Stat label="PROJECTED PnL" value={fmtMoney(myPnL)} color={myPnL >= 0 ? "var(--green)" : "var(--red)"} />
    </div>
  );
}

function MyOrders({ orders, onCancel }) {
  if (orders.length === 0) {
    return <div style={styles.empty}>No open orders</div>;
  }
  return (
    <div>
      {orders.map((o) => (
        <div key={o.id} style={styles.myOrderRow}>
          <span style={{ color: o.side === "buy" ? "var(--green)" : "var(--red)", width: 36, fontWeight: 700 }}>
            {o.side.toUpperCase()}
          </span>
          <span style={{ flex: 1 }}>{o.qty} @ ${o.price.toFixed(2)}</span>
          <button style={styles.cancelBtn} onClick={() => onCancel(o)}>×</button>
        </div>
      ))}
    </div>
  );
}

function Timeline({ elapsed, events, announcements }) {
  return (
    <div style={styles.timeline}>
      {TIMELINE.map((ev, i) => {
        const fired = events.find((e) => e.key === ev.key);
        const isPast = elapsed >= ev.t;
        const isNow = !fired && elapsed < ev.t && (i === 0 || elapsed >= TIMELINE[i - 1].t);
        return (
          <div key={ev.key} style={styles.tlRow}>
            <div style={{
              ...styles.tlDot,
              background: fired ? "var(--amber)" : isPast ? "var(--dim)" : "var(--panel-2)",
              boxShadow: isNow ? "0 0 0 4px rgba(255,184,0,0.18)" : "none",
            }} />
            <div style={styles.tlTime}>{fmtTime(ev.t)}</div>
            <div style={{ ...styles.tlLabel, color: fired ? "var(--fg)" : "var(--dim)" }}>
              {ev.label}
              {ev.key === "ann1" && announcements.ann1 != null && (
                <span style={styles.tlAnn}>Σ = {announcements.ann1}</span>
              )}
              {ev.key === "ann2" && announcements.ann2 != null && (
                <span style={styles.tlAnn}>Σ = {announcements.ann2}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Tape({ trades, myId }) {
  if (trades.length === 0) {
    return <div style={styles.empty}>No trades yet</div>;
  }
  return (
    <div style={styles.tape}>
      {trades.slice(0, 30).map((t) => {
        const mine = t.buyer === myId || t.seller === myId;
        const upTick = t.aggressor === "buy";
        return (
          <div key={t.id} style={{ ...styles.tapeRow, ...(mine ? styles.tapeMine : {}) }}>
            <span style={{ color: "var(--dim)", width: 28 }}>{t.qty}</span>
            <span style={{ flex: 1, color: upTick ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
              ${t.price.toFixed(2)}
            </span>
            <span style={{ color: "var(--dim)", fontSize: 10 }}>
              {mine ? "★ YOU" : upTick ? "↑" : "↓"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ConfigForm({ config, onChange }) {
  const [local, setLocal] = useState(config);
  useEffect(() => setLocal(config), [config]);
  return (
    <div>
      <div style={styles.field}>
        <label style={styles.fieldLabel}>DIST MIN (per player)</label>
        <input type="number" style={styles.input}
          value={local.distMin}
          onChange={(e) => setLocal({ ...local, distMin: +e.target.value })} />
      </div>
      <div style={styles.field}>
        <label style={styles.fieldLabel}>DIST MAX (per player)</label>
        <input type="number" style={styles.input}
          value={local.distMax}
          onChange={(e) => setLocal({ ...local, distMax: +e.target.value })} />
      </div>
      <div style={styles.field}>
        <label style={styles.fieldLabel}>ROUND LENGTH (sec)</label>
        <input type="number" style={styles.input}
          value={local.roundLength}
          onChange={(e) => setLocal({ ...local, roundLength: +e.target.value })} />
      </div>
      <button style={styles.submitBtn}
        onClick={() => onChange(local)}>APPLY CONFIG</button>
    </div>
  );
}

function PositionsTable({ players }) {
  const sorted = [...players].sort((a, b) => computePnL(b) - computePnL(a));
  return (
    <div>
      <div style={styles.posHeader}>
        <span style={{ width: 28 }}>#</span>
        <span style={{ flex: 2 }}>NAME</span>
        <span style={{ flex: 1, textAlign: "right" }}>BEANS</span>
        <span style={{ flex: 1, textAlign: "right" }}>CASH</span>
        <span style={{ flex: 1, textAlign: "right" }}>PnL</span>
      </div>
      {sorted.map((p, i) => {
        const pnl = computePnL(p);
        return (
          <div key={p.id} style={styles.posRow}>
            <span style={{ width: 28, color: "var(--dim)" }}>{i + 1}</span>
            <span style={{ flex: 2, fontWeight: p.isBot ? 400 : 700 }}>
              {p.name} {!p.isBot && <span style={{ color: "var(--amber)" }}>★</span>}
            </span>
            <span style={{ flex: 1, textAlign: "right", color: "var(--amber)" }}>{p.beans}</span>
            <span style={{ flex: 1, textAlign: "right" }}>{fmtMoney(p.cash)}</span>
            <span style={{ flex: 1, textAlign: "right", color: pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
              {fmtMoney(pnl)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Ticker({ events, announcements }) {
  const items = [];
  for (const e of events.slice().reverse()) {
    let txt = e.label;
    if (e.key === "ann1" && announcements.ann1 != null) txt += `: aggregate Σ = ${announcements.ann1}`;
    if (e.key === "ann2" && announcements.ann2 != null) txt += `: aggregate Σ = ${announcements.ann2}`;
    items.push(`[${fmtTime(e.firedAt ?? e.t)}] ${txt.toUpperCase()}`);
  }
  if (items.length === 0) items.push("● MARKET STANDING BY · WAITING FOR ROUND TO BEGIN ·");
  const stream = items.concat(items).join("   ◆   ");

  return (
    <div style={styles.ticker}>
      <div style={styles.tickerLabel}>WIRE</div>
      <div style={styles.tickerTrack}>
        <div style={styles.tickerStream}>{stream}</div>
      </div>
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Major+Mono+Display&display=swap');
  :root {
    --bg: #0a0e0f;
    --panel: #11181a;
    --panel-2: #1a2326;
    --border: #243033;
    --fg: #e6f0ee;
    --dim: #6b7e80;
    --green: #4ade80;
    --red: #f87171;
    --amber: #fbbf24;
    --blue: #60a5fa;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); }
  input { font-family: 'JetBrains Mono', monospace; }
  button { font-family: 'JetBrains Mono', monospace; }
  @keyframes tickerScroll {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  .bx-scroll::-webkit-scrollbar { width: 6px; }
  .bx-scroll::-webkit-scrollbar-track { background: transparent; }
  .bx-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
`;

const styles = {
  app: {
    fontFamily: "'JetBrains Mono', monospace",
    background: "var(--bg)",
    color: "var(--fg)",
    minHeight: "100vh",
    paddingBottom: 40,
  },

  // login
  loginWrap: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "radial-gradient(circle at 30% 20%, #15201f 0%, #0a0e0f 60%)",
    fontFamily: "'JetBrains Mono', monospace",
    padding: 24,
  },
  loginCard: {
    width: "100%", maxWidth: 480, padding: 40,
    background: "var(--panel)", border: "1px solid var(--border)",
    boxShadow: "0 30px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  loginBrand: { display: "flex", gap: 16, alignItems: "center" },
  loginLogo: {
    width: 56, height: 56, background: "var(--amber)", color: "#1a1100",
    fontFamily: "'Major Mono Display', monospace", fontSize: 22,
    display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: 1,
  },
  loginTitle: { fontFamily: "'Major Mono Display', monospace", fontSize: 22, color: "var(--fg)", letterSpacing: 3 },
  loginSub: { fontSize: 11, color: "var(--dim)", letterSpacing: 2, marginTop: 4 },
  loginLabel: { fontSize: 10, color: "var(--dim)", letterSpacing: 2, marginBottom: 8 },
  loginInput: {
    width: "100%", padding: "14px 16px", fontSize: 16,
    background: "var(--bg)", border: "1px solid var(--border)", color: "var(--fg)",
    outline: "none", letterSpacing: 1,
  },
  loginBtn: {
    width: "100%", padding: "14px 16px", marginTop: 12, fontSize: 12,
    background: "var(--amber)", color: "#1a1100", border: "none",
    letterSpacing: 3, fontWeight: 700, cursor: "pointer",
  },
  loginFoot: {
    marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--border)",
    fontSize: 10, color: "var(--dim)", lineHeight: 1.6, letterSpacing: 1,
  },

  // header
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 20px", background: "var(--panel)",
    borderBottom: "1px solid var(--border)",
    position: "sticky", top: 0, zIndex: 10,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 32 },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  brandLogo: {
    width: 32, height: 32, background: "var(--amber)", color: "#1a1100",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Major Mono Display', monospace", fontSize: 14,
  },
  brandText: { fontFamily: "'Major Mono Display', monospace", letterSpacing: 3, fontSize: 14 },
  tabs: { display: "flex", gap: 4 },
  tab: {
    background: "transparent", border: "1px solid transparent",
    padding: "8px 14px", color: "var(--dim)", fontSize: 11, letterSpacing: 2,
    cursor: "pointer",
  },
  tabActive: { color: "var(--amber)", borderColor: "var(--amber)" },

  headerRight: { display: "flex", alignItems: "center", gap: 20 },
  statusPill: {
    display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: 2,
    padding: "6px 12px", border: "1px solid var(--border)",
  },
  dot: { width: 8, height: 8, borderRadius: "50%" },
  clock: { textAlign: "right" },
  clockLabel: { fontSize: 9, color: "var(--dim)", letterSpacing: 2 },
  clockTime: { fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  userBlock: { textAlign: "right", borderLeft: "1px solid var(--border)", paddingLeft: 20 },
  userLabel: { fontSize: 9, color: "var(--dim)", letterSpacing: 2 },
  userPnL: { fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" },

  // grid
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 14,
    padding: 14,
  },
  col: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 },

  // panel
  panel: {
    background: "var(--panel)", border: "1px solid var(--border)",
  },
  panelHead: {
    padding: "8px 12px", borderBottom: "1px solid var(--border)",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "var(--panel-2)",
  },
  panelTitle: { fontSize: 10, letterSpacing: 3, color: "var(--dim)", fontWeight: 600 },
  panelBadge: {
    fontSize: 10, color: "var(--amber)", letterSpacing: 1,
    padding: "2px 6px", border: "1px solid var(--border)",
  },
  panelBody: { padding: 12 },

  // stats
  marketRow: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: "var(--border)" },
  stat: { padding: "10px 12px", background: "var(--panel)", textAlign: "center" },
  statLabel: { fontSize: 9, color: "var(--dim)", letterSpacing: 2, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" },

  // book
  bookHeader: {
    display: "flex", justifyContent: "space-between",
    fontSize: 9, color: "var(--dim)", letterSpacing: 2,
    padding: "6px 8px", borderBottom: "1px solid var(--border)",
  },
  bookSection: { padding: "4px 0" },
  bookRow: {
    position: "relative", display: "flex", padding: "4px 8px",
    fontSize: 13, fontVariantNumeric: "tabular-nums",
  },
  bookFill: { position: "absolute", top: 0, bottom: 0, pointerEvents: "none" },
  bookCell: { flex: 1, position: "relative", zIndex: 1 },
  bookEmpty: { padding: "16px 8px", color: "var(--dim)", fontSize: 11, textAlign: "center" },
  spreadRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 12px", background: "var(--bg)",
    borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
    fontSize: 13, letterSpacing: 1,
  },
  myMark: { color: "var(--amber)", marginRight: 4 },

  // trade panel
  sideToggle: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, marginBottom: 12, background: "var(--border)" },
  sideBtn: {
    padding: "10px", background: "var(--panel-2)", border: "none",
    color: "var(--dim)", fontSize: 11, letterSpacing: 2, cursor: "pointer", fontWeight: 600,
  },
  sideBuy: { background: "var(--green)", color: "#031507" },
  sideSell: { background: "var(--red)", color: "#fff" },
  typeToggle: { display: "flex", gap: 4, marginBottom: 14 },
  typeBtn: {
    flex: 1, padding: "6px", background: "transparent", border: "1px solid var(--border)",
    color: "var(--dim)", fontSize: 10, letterSpacing: 2, cursor: "pointer",
  },
  typeActive: { color: "var(--amber)", borderColor: "var(--amber)" },
  field: { marginBottom: 12 },
  fieldLabel: { display: "block", fontSize: 9, color: "var(--dim)", letterSpacing: 2, marginBottom: 4 },
  input: {
    width: "100%", padding: "10px 12px", fontSize: 14,
    background: "var(--bg)", border: "1px solid var(--border)", color: "var(--fg)",
    outline: "none", fontVariantNumeric: "tabular-nums",
  },
  submitBtn: {
    width: "100%", padding: "12px", marginTop: 8,
    border: "none", fontSize: 11, letterSpacing: 2, fontWeight: 700, cursor: "pointer",
  },

  // inventory
  invGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--border)" },

  // my orders
  empty: { padding: "16px 8px", color: "var(--dim)", fontSize: 11, textAlign: "center" },
  myOrderRow: {
    display: "flex", alignItems: "center", padding: "8px 4px",
    borderBottom: "1px solid var(--border)", fontSize: 12, fontVariantNumeric: "tabular-nums",
  },
  cancelBtn: {
    width: 24, height: 24, background: "var(--panel-2)", color: "var(--red)",
    border: "1px solid var(--border)", cursor: "pointer", fontSize: 14,
  },

  // timeline
  timeline: { display: "flex", flexDirection: "column", gap: 0 },
  tlRow: { display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)" },
  tlDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0, transition: "all 0.3s" },
  tlTime: { fontSize: 12, color: "var(--dim)", width: 50, fontVariantNumeric: "tabular-nums" },
  tlLabel: { flex: 1, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" },
  tlAnn: {
    color: "var(--amber)", fontSize: 11, fontWeight: 700,
    padding: "2px 8px", border: "1px solid var(--amber)",
  },

  // tape
  tape: { maxHeight: 280, overflowY: "auto" },
  tapeRow: {
    display: "flex", alignItems: "center", padding: "4px 6px", gap: 8,
    fontSize: 12, fontVariantNumeric: "tabular-nums", borderBottom: "1px solid var(--border)",
  },
  tapeMine: { background: "rgba(251,191,36,0.06)" },

  // admin
  adminButtons: { display: "grid", gridTemplateColumns: "1fr", gap: 8 },
  bigBtn: {
    padding: "16px", border: "none", fontSize: 14, fontWeight: 700,
    letterSpacing: 3, cursor: "pointer",
  },

  // positions
  posHeader: {
    display: "flex", padding: "8px 6px", fontSize: 9, color: "var(--dim)", letterSpacing: 2,
    borderBottom: "1px solid var(--border)",
  },
  posRow: {
    display: "flex", padding: "10px 6px", fontSize: 13,
    borderBottom: "1px solid var(--border)", fontVariantNumeric: "tabular-nums",
    alignItems: "center",
  },
  totalsRow: {
    display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginTop: 14, background: "var(--border)",
  },

  // ticker
  ticker: {
    position: "fixed", bottom: 0, left: 0, right: 0,
    height: 32, background: "var(--panel)", borderTop: "1px solid var(--border)",
    display: "flex", alignItems: "center", overflow: "hidden", zIndex: 5,
  },
  tickerLabel: {
    padding: "0 16px", height: "100%", display: "flex", alignItems: "center",
    fontSize: 10, color: "#1a1100", background: "var(--amber)", letterSpacing: 3, fontWeight: 700,
  },
  tickerTrack: { flex: 1, overflow: "hidden", padding: "0 16px" },
  tickerStream: {
    whiteSpace: "nowrap", animation: "tickerScroll 80s linear infinite",
    fontSize: 11, color: "var(--dim)", letterSpacing: 2,
  },
};
