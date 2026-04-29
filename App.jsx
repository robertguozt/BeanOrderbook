import React, { useState } from "react";
import { useGame } from "./lib/useGame.js";
import Login from "./pages/Login.jsx";
import PlayerTerminal from "./pages/PlayerTerminal.jsx";
import AdminTerminal from "./pages/AdminTerminal.jsx";
import Header from "./components/Header.jsx";
import Ticker from "./components/Ticker.jsx";

export default function App() {
  const game = useGame();
  const [loggedIn, setLoggedIn] = useState(false);

  if (!game.state.me || !loggedIn) {
    return (
      <Login
        onLogin={(name, pass) => {
          game.login(name, pass);
          setLoggedIn(true);
        }}
        error={game.state.errorMsg}
        clearError={game.clearError}
      />
    );
  }

  const isAdmin = game.state.me.isAdmin;

  return (
    <div className="min-h-screen bg-bg text-fg pb-10">
      <Header me={game.state.me} timer={game.state.timer} />
      {isAdmin
        ? <AdminTerminal game={game} />
        : <PlayerTerminal game={game} />}
      <Ticker events={game.state.events} announcements={game.state.announcements} />
    </div>
  );
}
