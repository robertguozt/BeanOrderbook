// useGame.js — single hook that owns the client's view of game state.
//
// Subscribes to all server events and exposes a snapshot plus action
// dispatchers. Keeps the components dumb and consistent with the wire
// protocol declared in shared/constants.js.

import { useEffect, useReducer, useCallback } from "react";
import { socket } from "./socket.js";
import { EVENTS } from "@shared/constants.js";

const initial = {
  me: null,
  players: [],          // visible to me (full list if admin, else just me)
  book: { bids: [], asks: [] },
  trades: [],           // newest first, capped
  events: [],           // game timeline events fired
  announcements: { ann1: null, ann2: null },
  timer: { phase: "lobby", elapsed: 0, remaining: 0, config: {}, timeline: [] },
  errorMsg: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "ME":          return { ...state, me: action.player };
    case "PLAYERS":     return { ...state, players: action.players };
    case "BOOK":        return { ...state, book: action.book };
    case "TRADE":       return { ...state, trades: [action.trade, ...state.trades].slice(0, 100) };
    case "EVENT":       return { ...state, events: [...state.events, action.event] };
    case "TIMER":       return { ...state, timer: action.timer, announcements: action.announcements ?? state.announcements };
    case "TICK":        return { ...state, timer: { ...state.timer, elapsed: action.elapsed,
                                                    remaining: Math.max(0, (state.timer.config.roundLength || 600) - action.elapsed) } };
    case "ERROR":       return { ...state, errorMsg: action.msg };
    case "CLEAR_ERROR": return { ...state, errorMsg: null };
    case "RESET":       return { ...initial, me: state.me };
    default: return state;
  }
}

export function useGame() {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    const onYou      = ({ player })             => dispatch({ type: "ME", player });
    const onPlayers  = (players)                => dispatch({ type: "PLAYERS", players });
    const onBook     = (book)                   => dispatch({ type: "BOOK", book });
    const onTrade    = (trade)                  => dispatch({ type: "TRADE", trade });
    const onEvent    = (event)                  => dispatch({ type: "EVENT", event });
    const onState    = ({ timer, announcements }) => dispatch({ type: "TIMER", timer, announcements });
    const onTick     = ({ elapsed })            => dispatch({ type: "TICK", elapsed });
    const onError    = ({ msg })                => dispatch({ type: "ERROR", msg });

    socket.on(EVENTS.YOU,        onYou);
    socket.on(EVENTS.PLAYERS,    onPlayers);
    socket.on(EVENTS.ORDER_BOOK, onBook);
    socket.on(EVENTS.TRADE,      onTrade);
    socket.on(EVENTS.GAME_EVENT, onEvent);
    socket.on(EVENTS.STATE,      onState);
    socket.on(EVENTS.TICK,       onTick);
    socket.on(EVENTS.ERROR,      onError);

    return () => {
      socket.off(EVENTS.YOU,        onYou);
      socket.off(EVENTS.PLAYERS,    onPlayers);
      socket.off(EVENTS.ORDER_BOOK, onBook);
      socket.off(EVENTS.TRADE,      onTrade);
      socket.off(EVENTS.GAME_EVENT, onEvent);
      socket.off(EVENTS.STATE,      onState);
      socket.off(EVENTS.TICK,       onTick);
      socket.off(EVENTS.ERROR,      onError);
    };
  }, []);

  // ---- action dispatchers ----
  const login        = useCallback((name, adminPass) => socket.emit(EVENTS.LOGIN, { name, adminPass }), []);
  const placeOrder   = useCallback((order)        => socket.emit(EVENTS.PLACE_ORDER, order), []);
  const cancelOrder  = useCallback((orderId)      => socket.emit(EVENTS.CANCEL_ORDER, { orderId }), []);
  const adminStart   = useCallback(()             => socket.emit(EVENTS.ADMIN_START), []);
  const adminPause   = useCallback(()             => socket.emit(EVENTS.ADMIN_PAUSE), []);
  const adminReset   = useCallback(()             => socket.emit(EVENTS.ADMIN_RESET), []);
  const adminConfig  = useCallback((cfg)          => socket.emit(EVENTS.ADMIN_CONFIG, cfg), []);
  const clearError   = useCallback(()             => dispatch({ type: "CLEAR_ERROR" }), []);

  return { state, login, placeOrder, cancelOrder, adminStart, adminPause, adminReset, adminConfig, clearError };
}
