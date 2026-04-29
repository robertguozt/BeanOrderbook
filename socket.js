// socket.js — Socket.io client configuration.
//
// Lazily connects on first import, autoreconnects, and exposes a single
// shared instance so all components share the same connection.

import { io } from "socket.io-client";

const URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

export const socket = io(URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  transports: ["websocket"], // skip long-poll fallback for lower latency
});

socket.on("connect", () => console.log("[socket] connected", socket.id));
socket.on("disconnect", (r) => console.log("[socket] disconnected", r));
socket.on("connect_error", (e) => console.warn("[socket] connect_error", e.message));
