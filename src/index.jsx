import { useState, useEffect, useRef, useCallback } from "react";

// ── Deriv WebSocket endpoint ──────────────────────────────────────────────────
const WS_URL = "wss://ws.binaryws.com/websockets/v3?app_id=1089";

// ── LocalStorage keys ─────────────────────────────────────────────────────────
const STORAGE_KEY_API = "derivApiKey";
const STORAGE_KEY_REMEMBER = "derivRememberMe";

// ── Colour palette & shared styles ───────────────────────────────────────────
const C = {
  bg0: "#050810",
  bg1: "#0a0f1e",
  bg2: "#0f1629",
  panel: "#111827",
  border: "#1e2d45",
  accent: "#00e5ff",
  accentDim: "#00b8cc",
  green: "#00ff88",
  red: "#ff3b5c",
  yellow: "#ffd600",
  text: "#c8d8f0",
  muted: "#4a6080",
  white: "#e8f4ff",
};

const glowStyle = (color = C.accent) => ({
  boxShadow: `0 0 12px ${color}44, 0 0 32px ${color}22`,
  border: `1px solid ${color}66`,
});

// ── Tiny helpers ──────────────────────────────────────────────────────────────
const fmt = (n, d = 2) => (n == null ? "—" : Number(n).toFixed(d));
const fmtTime = (ts) => new Date(ts * 1000).toLocaleTimeString();
const uid = () => Math.floor(Math.random() * 1e9);

// ────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ────────────────────────────────────────────────────────────────────────────
export default function DerivBot() {
  // ── connection / auth state ────────────────────────────────────────────────
  const [apiKey, setApiKey] = useState("");
  const [inputKey, setInputKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // ── market / bot state ────────────────────────────────────────────────────
  const [symbol, setSymbol] = useState("R_100");
  const [stake, setStake] = useState("1");
  const [duration, setDuration] = useState("5");
  const [contractType, setContractType] = useState("CALL");
  const [botRunning, setBotRunning] = useState(false);
  const [botMode, setBotMode] = useState("manual"); // manual | auto

  // ── market data ───────────────────────────────────────────────────────────
  const [tick, setTick] = useState(null);
  const [ticks, setTicks] = useState([]);
  const [openContract, setOpenContract] = useState(null);
  const [trades, setTrades] = useState([]);

  // ── auto-bot params ───────────────────────────────────────────────────────
  const [autoStake, setAutoStake] = useState("1");
  const [martingale, setMartingale] = useState(false);
  const [martFactor, setMartFactor] = useState("2");
  const [maxTrades, setMaxTrades] = useState("10");
  const [autoCount, setAutoCount] = useState(0);

  // ── logs ──────────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState([]);

  // ── refs ──────────────────────────────────────────────────────────────────
  const ws = useRef(null);
  const pendingReqs = useRef({});
  const botRef = useRef({ running: false, stake: 1, count: 0 });
  const logsEndRef = useRef(null);
  const canvasRef = useRef(null);

  const log = useCallback((msg, type = "info") => {
    const entry = { msg, type, time: new Date().toLocaleTimeString() };
    setLogs((prev) => [...prev.slice(-199), entry]);
  }, []);

  // ── Load saved API key on mount ────────────────────────────────────────────
  useEffect(() => {
    const savedKey = localStorage.getItem(STORAGE_KEY_API);
    const savedRemember = localStorage.getItem(STORAGE_KEY_REMEMBER) === "true";

    if (savedKey && savedRemember) {
      setApiKey(savedKey);
      setRememberMe(true);
      setIsLoading(true);
      // Auto-connect after a brief delay
      setTimeout(() => {
        connectWebSocket(savedKey);
      }, 300);
    } else {
      setIsLoading(false);
    }
  }, []);

  // ── Canvas sparkline ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || ticks.length < 2) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const vals = ticks.map((t) => t.quote);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    const pts = vals.map((v, i) => ({
      x: (i / (vals.length - 1)) * W,
      y: H - ((v - min) / range) * (H - 10) - 5,
    }));
    // gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#00e5ff44");
    grad.addColorStop(1, "#00e5ff00");
    ctx.beginPath();
    ctx.moveTo(pts[0].x, H);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // line
    ctx.beginPath();
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 2;
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }, [ticks]);

  // ── auto-scroll logs ──────────────────────────────────────────────────────
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ── WebSocket core ────────────────────────────────────────────────────────
  const send = useCallback((payload, onResp) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    const req_id = uid();
    if (onResp) pendingReqs.current[req_id] = onResp;
    ws.current.send(JSON.stringify({ ...payload, req_id }));
  }, []);

  const connectWebSocket = useCallback((key) => {
    if (ws.current) ws.current.close();
    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      setConnected(true);
      setError("");
      log("WebSocket connected to Deriv", "success");
      // Authorize
      socket.send(JSON.stringify({ authorize: key, req_id: uid() }));
    };

    socket.onmessage = ({ data }) => {
      const msg = JSON.parse(data);
      // dispatch pending
      if (msg.req_id && pendingReqs.current[msg.req_id]) {
        pendingReqs.current[msg.req_id](msg);
        delete pendingReqs.current[msg.req_id];
      }
      handleMessage(msg);
    };

    socket.onerror = () => {
      setError("WebSocket error. Check API key / network.");
      log("WebSocket error", "error");
      setIsLoading(false);
    };

    socket.onclose = () => {
      setConnected(false);
      setAuthorized(false);
      log("WebSocket closed", "warn");
    };
  }, [log]);

  const handleMessage = useCallback((msg) => {
    if (msg.error) {
      setError(msg.error.message);
      log(`ERROR: ${msg.error.message}`, "error");
      setIsLoading(false);
      return;
    }

    if (msg.authorize) {
      const acc = msg.authorize;
      setAccount(acc);
      setAuthorized(true);
      setError("");
      setIsLoading(false);
      log(`Authorized as ${acc.email} | ${acc.currency} account`, "success");
      // subscribe balance
      ws.current?.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: uid() }));
      // subscribe ticks
      ws.current?.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: uid() }));
    }

    if (msg.balance) {
      setBalance(msg.balance);
    }

    if (msg.tick) {
      const t = msg.tick;
      setTick(t);
      setTicks((prev) => [...prev.slice(-79), t]);
    }

    if (msg.buy) {
      const c = msg.buy;
      log(`✔ Contract bought | ID: ${c.contract_id} | Price: ${c.buy_price}`, "success");
      setOpenContract(c);
      // subscribe to contract updates
      ws.current?.send(
        JSON.stringify({ proposal_open_contract: 1, contract_id: c.contract_id, subscribe: 1, req_id: uid() })
      );
    }

    if (msg.proposal_open_contract) {
      const c = msg.proposal_open_contract;
      setOpenContract(c);
      if (c.status === "won" || c.status === "lost") {
        const pnl = c.status === "won" ? c.profit : -c.buy_price;
        const entry = {
          id: c.contract_id,
          type: c.contract_type,
          symbol: c.underlying,
          buy: c.buy_price,
          profit: pnl,
          status: c.status,
          time: new Date().toLocaleTimeString(),
        };
        setTrades((prev) => [entry, ...prev.slice(0, 49)]);
        log(
          `Contract ${c.status.toUpperCase()} | P&L: ${pnl > 0 ? "+" : ""}${fmt(pnl)} ${c.currency}`,
          c.status === "won" ? "success" : "error"
        );
        setOpenContract(null);
        // auto-bot next trade
        if (botRef.current.running) {
          handleAutoBotNext(c);
        }
      }
    }

    if (msg.proposal) {
      // auto-buy on proposal
      if (msg.proposal._autoBuy) {
        send(
          { buy: msg.proposal.id, price: msg.proposal.ask_price },
          () => {}
        );
      }
    }
  }, [symbol, send, log]);

  const handleAutoBotNext = useCallback(
    (lastContract) => {
      if (!botRef.current.running) return;
      botRef.current.count += 1;
      setAutoCount(botRef.current.count);
      if (botRef.current.count >= botRef.current.maxTrades) {
        botRef.current.running = false;
        setBotRunning(false);
        log("Auto-bot: max trades reached. Stopped.", "warn");
        return;
      }
      // martingale: double stake on loss
      if (martingale && lastContract.status === "lost") {
        botRef.current.stake = parseFloat(
          (botRef.current.stake * parseFloat(martFactor)).toFixed(2)
        );
        log(`Martingale: stake → ${botRef.current.stake}`, "warn");
      } else {
        botRef.current.stake = parseFloat(autoStake);
      }
      setAutoStake(String(botRef.current.stake));
      // flip contract type on loss (anti-martingale direction)
      const nextType = lastContract.status === "lost"
        ? contractType === "CALL" ? "PUT" : "CALL"
        : contractType;
      placeOrder(nextType, botRef.current.stake);
    },
    [martingale, martFactor, autoStake, contractType, log]
  );

  const placeOrder = useCallback(
    (type = contractType, s = parseFloat(stake)) => {
      if (!authorized) return;
      const payload = {
        buy: 1,
        subscribe: 1,
        price: s,
        parameters: {
          amount: s,
          basis: "stake",
          contract_type: type,
          currency: account?.currency || "USD",
          duration: parseInt(duration),
          duration_unit: "t",
          symbol,
        },
      };
      log(`Placing ${type} | ${symbol} | $${s} | ${duration}t`, "info");
      send(payload);
    },
    [authorized, contractType, stake, duration, symbol, account, send, log]
  );

  // ── Start / Stop handlers ─────────────────────────────────────────────────
  const handleAuth = () => {
    if (!inputKey.trim()) { setError("Enter your Deriv API key"); return; }
    const key = inputKey.trim();
    setApiKey(key);
    
    // Save to localStorage if remember me is checked
    if (rememberMe) {
      localStorage.setItem(STORAGE_KEY_API, key);
      localStorage.setItem(STORAGE_KEY_REMEMBER, "true");
    } else {
      localStorage.removeItem(STORAGE_KEY_API);
      localStorage.removeItem(STORAGE_KEY_REMEMBER);
    }
    
    setIsLoading(true);
    connectWebSocket(key);
  };

  const handleDisconnect = () => {
    ws.current?.close();
    setApiKey("");
    setAuthorized(false);
    setAccount(null);
    setBalance(null);
    setTick(null);
    setTicks([]);
    setTrades([]);
    setLogs([]);
    botRef.current.running = false;
    setBotRunning(false);
    setIsLoading(false);
  };

  const handleForgetCredentials = () => {
    localStorage.removeItem(STORAGE_KEY_API);
    localStorage.removeItem(STORAGE_KEY_REMEMBER);
    setRememberMe(false);
    handleDisconnect();
  };

  const startAutoBot = () => {
    botRef.current.running = true;
    botRef.current.stake = parseFloat(autoStake);
    botRef.current.count = 0;
    botRef.current.maxTrades = parseInt(maxTrades);
    setBotRunning(true);
    setAutoCount(0);
    log(`Auto-bot started | stake $${autoStake} | max ${maxTrades} trades`, "success");
    placeOrder(contractType, parseFloat(autoStake));
  };

  const stopAutoBot = () => {
    botRef.current.running = false;
    setBotRunning(false);
    log("Auto-bot stopped by user", "warn");
  };

  // ── Change symbol: re-subscribe ticks ─────────────────────────────────────
  useEffect(() => {
    if (!authorized || !ws.current) return;
    ws.current.send(JSON.stringify({ forget_all: "ticks", req_id: uid() }));
    ws.current.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: uid() }));
    setTicks([]);
  }, [symbol, authorized]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const wins = trades.filter((t) => t.status === "won").length;
  const losses = trades.filter((t) => t.status === "lost").length;
  const totalPnl = trades.reduce((s, t) => s + t.profit, 0);
  const winRate = trades.length ? ((wins / trades.length) * 100).toFixed(1) : "—";

  // ── UI ─────────────────────────────────────────────────────────────────────
  const symbols = [
    { v: "R_10", l: "Volatility 10" },
    { v: "R_25", l: "Volatility 25" },
    { v: "R_50", l: "Volatility 50" },
    { v: "R_75", l: "Volatility 75" },
    { v: "R_100", l: "Volatility 100" },
    { v: "1HZ10V", l: "Vol 10 (1s)" },
    { v: "1HZ100V", l: "Vol 100 (1s)" },
    { v: "BOOM500", l: "Boom 500" },
    { v: "BOOM1000", l: "Boom 1000" },
    { v: "CRASH500", l: "Crash 500" },
    { v: "CRASH1000", l: "Crash 1000" },
  ];

  const logColor = { info: C.text, success: C.green, error: C.red, warn: C.yellow };

  // Show loading spinner while connecting
  if (isLoading && authorized === false) {
    return (
      <div style={{ fontFamily: "'Courier New', monospace", background: C.bg0, minHeight: "100vh", color: C.text, padding: "0", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap');
          @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        `}</style>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 60, height: 60, border: `2px solid ${C.border}`, borderTop: `2px solid ${C.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 20px" }} />
          <div style={{ fontSize: 16, color: C.accent, letterSpacing: 2, marginBottom: 10 }}>CONNECTING…</div>
          <div style={{ fontSize: 12, color: C.muted }}>Auto-connecting with saved credentials</div>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Courier New', monospace", background: C.bg0, minHeight: "100vh", color: C.text, padding: "0" }}>
      {/* ── Google Font import trick via style tag ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${C.bg1}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        body { margin: 0; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideIn { from{transform:translateY(-8px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .stat-card { transition: transform 0.15s, box-shadow 0.15s; }
        .stat-card:hover { transform: translateY(-2px); }
        .btn-primary:hover { background: ${C.accentDim} !important; }
        .btn-danger:hover { background: #cc2244 !important; }
        .btn-success:hover { background: #00cc66 !important; }
        .trade-row { animation: slideIn 0.25s ease; }
        .log-entry { animation: slideIn 0.1s ease; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background: C.bg1, borderBottom: `1px solid ${C.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 18, color: C.bg0 }}>X</div>
          <div>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 18, color: C.white, letterSpacing: 2 }}>DERIV-X BOT</div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>AUTOMATED TRADING TERMINAL v2.0</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Status dot */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: authorized ? C.green : connected ? C.yellow : C.red,
              animation: (connected || authorized) ? "pulse 2s infinite" : "none"
            }} />
            <span style={{ fontSize: 11, color: C.muted, letterSpacing: 1 }}>
              {authorized ? "AUTHORIZED" : connected ? "CONNECTING…" : "OFFLINE"}
            </span>
          </div>
          {authorized && (
            <div style={{ fontSize: 11, color: C.accent, letterSpacing: 1 }}>
              {account?.email?.split("@")[0].toUpperCase()}
            </div>
          )}
          {authorized && (
            <button onClick={handleDisconnect} className="btn-danger" style={{ background: "#7f1d1d", border: "none", color: C.red, borderRadius: 4, padding: "4px 12px", fontSize: 11, cursor: "pointer", letterSpacing: 1 }}>
              DISCONNECT
            </button>
          )}
          {authorized && (
            <button onClick={handleForgetCredentials} className="btn-danger" style={{ background: "#5f1515", border: `1px solid ${C.red}`, color: C.red, borderRadius: 4, padding: "4px 12px", fontSize: 11, cursor: "pointer", letterSpacing: 1 }}>
              FORGET
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{ padding: "20px 24px", display: "grid", gap: 16 }}>

        {/* ── AUTH PANEL ── */}
        {!authorized && (
          <div style={{ background: C.panel, borderRadius: 8, padding: 24, border: `1px solid ${C.border}`, maxWidth: 520 }}>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: C.accent, letterSpacing: 2, marginBottom: 4 }}>API AUTHENTICATION</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 16, letterSpacing: 0.5 }}>
              Get your token from Deriv → Settings → API Token (Read + Trade permissions)
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="password"
                placeholder="Paste Deriv API token here…"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                style={{ flex: 1, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 12px", color: C.white, fontFamily: "inherit", fontSize: 13, outline: "none" }}
              />
              <button onClick={handleAuth} className="btn-primary" style={{ background: C.accent, border: "none", color: C.bg0, borderRadius: 4, padding: "8px 20px", fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: 1 }}>
                CONNECT
              </button>
            </div>
            
            {/* Remember Me checkbox */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: C.text, marginTop: 12 }}>
              <input 
                type="checkbox" 
                checked={rememberMe} 
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ accentColor: C.accent, cursor: "pointer" }} 
              />
              <span style={{ letterSpacing: 0.5 }}>Remember me on this device</span>
            </label>
            <div style={{ fontSize: 10, color: C.red, marginTop: 8, letterSpacing: 0.5 }}>
              ⚠ Only enable on trusted devices. API key stored locally in browser.
            </div>

            {error && <div style={{ marginTop: 10, color: C.red, fontSize: 12 }}>⚠ {error}</div>}
            <div style={{ marginTop: 14, fontSize: 10, color: C.muted }}>
              ⓘ Uses <span style={{ color: C.accent }}>wss://ws.binaryws.com/websockets/v3</span> · app_id=1089 (demo)
            </div>
          </div>
        )}

        {/* ── AUTHORIZED DASHBOARD ── */}
        {authorized && (
          <>
            {/* ── STAT CARDS ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12 }}>
              {[
                { label: "BALANCE", value: `${fmt(balance?.balance)} ${balance?.currency || ""}`, color: C.accent },
                { label: "LIVE PRICE", value: tick ? fmt(tick.quote, 4) : "—", color: C.white },
                { label: "WIN RATE", value: `${winRate}%`, color: winRate === "—" ? C.muted : parseFloat(winRate) >= 50 ? C.green : C.red },
                { label: "NET P&L", value: `${totalPnl >= 0 ? "+" : ""}${fmt(totalPnl)}`, color: totalPnl >= 0 ? C.green : C.red },
                { label: "TRADES", value: trades.length, color: C.text },
                { label: "W / L", value: `${wins} / ${losses}`, color: C.text },
              ].map((s) => (
                <div key={s.label} className="stat-card" style={{ background: C.panel, borderRadius: 6, padding: "12px 16px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 9, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 20, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* ── CHART + CONTROLS ROW ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>

              {/* ── CHART ── */}
              <div style={{ background: C.panel, borderRadius: 8, padding: 16, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, color: C.accent, letterSpacing: 1 }}>{symbols.find(s => s.v === symbol)?.l}</span>
                    {tick && <span style={{ marginLeft: 12, fontFamily: "'Share Tech Mono', monospace", color: C.white, fontSize: 18 }}>{fmt(tick.quote, 4)}</span>}
                    {tick && <span style={{ marginLeft: 8, fontSize: 11, color: C.muted }}>{fmtTime(tick.epoch)}</span>}
                  </div>
                  {openContract && (
                    <div style={{ ...glowStyle(C.yellow), borderRadius: 4, padding: "4px 10px", fontSize: 11, color: C.yellow, animation: "pulse 1s infinite" }}>
                      ◉ OPEN CONTRACT
                    </div>
                  )}
                </div>
                <canvas
                  ref={canvasRef}
                  width={700}
                  height={140}
                  style={{ width: "100%", height: 140, borderRadius: 4, display: "block" }}
                />
                <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 10, color: C.muted }}>
                  <span>MIN: {ticks.length ? fmt(Math.min(...ticks.map(t => t.quote)), 4) : "—"}</span>
                  <span>MAX: {ticks.length ? fmt(Math.max(...ticks.map(t => t.quote)), 4) : "—"}</span>
                  <span>TICKS: {ticks.length}</span>
                </div>
              </div>

              {/* ── CONTROLS ── */}
              <div style={{ background: C.panel, borderRadius: 8, padding: 16, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, color: C.accent, letterSpacing: 2, fontSize: 13 }}>TRADE CONTROLS</div>

                {/* Symbol */}
                <div>
                  <label style={{ fontSize: 9, color: C.muted, letterSpacing: 2, display: "block", marginBottom: 4 }}>SYMBOL</label>
                  <select value={symbol} onChange={e => setSymbol(e.target.value)}
                    style={{ width: "100%", background: C.bg2, border: `1px solid ${C.border}`, color: C.white, borderRadius: 4, padding: "6px 8px", fontFamily: "inherit", fontSize: 12, outline: "none" }}>
                    {symbols.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </div>

                {/* Contract type */}
                <div>
                  <label style={{ fontSize: 9, color: C.muted, letterSpacing: 2, display: "block", marginBottom: 4 }}>DIRECTION</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {["CALL", "PUT"].map(t => (
                      <button key={t} onClick={() => setContractType(t)}
                        style={{ background: contractType === t ? (t === "CALL" ? C.green : C.red) : C.bg2, border: `1px solid ${contractType === t ? (t === "CALL" ? C.green : C.red) : C.border}`, color: contractType === t ? C.bg0 : C.text, borderRadius: 4, padding: "6px 0", fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11, cursor: "pointer", letterSpacing: 1 }}>
                        {t === "CALL" ? "▲ RISE" : "▼ FALL"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stake + Duration */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 9, color: C.muted, letterSpacing: 2, display: "block", marginBottom: 4 }}>STAKE ($)</label>
                    <input type="number" value={stake} onChange={e => setStake(e.target.value)} min="0.35"
                      style={{ width: "100%", background: C.bg2, border: `1px solid ${C.border}`, color: C.white, borderRadius: 4, padding: "6px 8px", fontFamily: "inherit", fontSize: 13, outline: "none" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 9, color: C.muted, letterSpacing: 2, display: "block", marginBottom: 4 }}>TICKS</label>
                    <input type="number" value={duration} onChange={e => setDuration(e.target.value)} min="1" max="10"
                      style={{ width: "100%", background: C.bg2, border: `1px solid ${C.border}`, color: C.white, borderRadius: 4, padding: "6px 8px", fontFamily: "inherit", fontSize: 13, outline: "none" }}
                    />
                  </div>
                </div>

                {/* Manual trade button */}
                <button onClick={() => placeOrder()} disabled={!!openContract}
                  className="btn-primary"
                  style={{ background: openContract ? C.muted : C.accent, border: "none", color: C.bg0, borderRadius: 4, padding: "10px 0", fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, cursor: openContract ? "default" : "pointer", letterSpacing: 1 }}>
                  {openContract ? "TRADE OPEN…" : `▶ ${contractType === "CALL" ? "BUY RISE" : "BUY FALL"}`}
                </button>

                {/* Mode switcher */}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                    {["manual", "auto"].map(m => (
                      <button key={m} onClick={() => setBotMode(m)}
                        style={{ background: botMode === m ? C.bg0 : "transparent", border: `1px solid ${botMode === m ? C.accent : C.border}`, color: botMode === m ? C.accent : C.muted, borderRadius: 4, padding: "6px 0", fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, cursor: "pointer", fontSize: 11, letterSpacing: 1 }}>
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  {botMode === "auto" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <label style={{ fontSize: 9, color: C.muted, letterSpacing: 2, display: "block", marginBottom: 4 }}>AUTO STAKE</label>
                          <input type="number" value={autoStake} onChange={e => setAutoStake(e.target.value)} min="0.35"
                            style={{ width: "100%", background: C.bg2, border: `1px solid ${C.border}`, color: C.white, borderRadius: 4, padding: "6px 8px", fontFamily: "inherit", fontSize: 13, outline: "none" }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 9, color: C.muted, letterSpacing: 2, display: "block", marginBottom: 4 }}>MAX TRADES</label>
                          <input type="number" value={maxTrades} onChange={e => setMaxTrades(e.target.value)} min="1"
                            style={{ width: "100%", background: C.bg2, border: `1px solid ${C.border}`, color: C.white, borderRadius: 4, padding: "6px 8px", fontFamily: "inherit", fontSize: 13, outline: "none" }}
                          />
                        </div>
                      </div>

                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: C.text }}>
                        <input type="checkbox" checked={martingale} onChange={e => setMartingale(e.target.checked)}
                          style={{ accentColor: C.yellow }} />
                        MARTINGALE
                        {martingale && (
                          <input type="number" value={martFactor} onChange={e => setMartFactor(e.target.value)} min="1.1" max="5" step="0.1"
                            style={{ width: 50, background: C.bg2, border: `1px solid ${C.border}`, color: C.yellow, borderRadius: 4, padding: "2px 6px", fontFamily: "inherit", fontSize: 12, outline: "none" }}
                          />
                        )}
                      </label>

                      {botRunning && (
                        <div style={{ fontSize: 10, color: C.yellow, letterSpacing: 1, animation: "pulse 1s infinite" }}>
                          ◉ BOT ACTIVE — trade {autoCount}/{maxTrades}
                        </div>
                      )}

                      {!botRunning ? (
                        <button onClick={startAutoBot} disabled={!!openContract} className="btn-success"
                          style={{ background: C.green, border: "none", color: C.bg0, borderRadius: 4, padding: "9px 0", fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 13, cursor: openContract ? "default" : "pointer", letterSpacing: 1 }}>
                          ▶▶ START BOT
                        </button>
                      ) : (
                        <button onClick={stopAutoBot} className="btn-danger"
                          style={{ background: C.red, border: "none", color: C.white, borderRadius: 4, padding: "9px 0", fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", letterSpacing: 1 }}>
                          ■ STOP BOT
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── TRADES + LOGS ROW ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* Trade History */}
              <div style={{ background: C.panel, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, color: C.accent, letterSpacing: 2, fontSize: 12 }}>TRADE HISTORY</span>
                  <span style={{ fontSize: 10, color: C.muted }}>{trades.length} records</span>
                </div>
                <div style={{ height: 260, overflowY: "auto" }}>
                  {trades.length === 0 && (
                    <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 12 }}>No trades yet</div>
                  )}
                  {trades.map((t, i) => (
                    <div key={t.id || i} className="trade-row" style={{ display: "grid", gridTemplateColumns: "60px 70px 80px 70px 1fr", gap: 8, padding: "8px 16px", borderBottom: `1px solid ${C.border}11` }}>
                      <span style={{ color: t.type === "CALL" ? C.green : C.red, fontWeight: 700 }}>{t.type === "CALL" ? "▲" : "▼"} {t.type}</span>
                      <span style={{ color: C.muted }}>{t.symbol}</span>
                      <span style={{ color: t.status === "won" ? C.green : C.red, fontWeight: 700, textAlign: "right" }}>
                        {t.profit > 0 ? "+" : ""}{fmt(t.profit)}
                      </span>
                      <span style={{ color: t.status === "won" ? C.green : C.red, fontSize: 10, letterSpacing: 1 }}>
                        {t.status?.toUpperCase()}
                      </span>
                      <span style={{ color: C.muted, fontSize: 10, textAlign: "right" }}>{t.time}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Logs */}
              <div style={{ background: C.panel, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, color: C.accent, letterSpacing: 2, fontSize: 12 }}>SYSTEM LOG</span>
                  <button onClick={() => setLogs([])} style={{ background: "none", border: "none", color: C.muted, fontSize: 10, cursor: "pointer", letterSpacing: 1 }}>CLEAR</button>
                </div>
                <div style={{ height: 260, overflowY: "auto", fontFamily: "'Share Tech Mono', monospace", fontSize: 11 }}>
                  {logs.map((l, i) => (
                    <div key={i} className="log-entry" style={{ padding: "4px 16px", borderBottom: `1px solid ${C.border}11`, display: "flex", gap: 10 }}>
                      <span style={{ color: C.muted, flexShrink: 0 }}>{l.time}</span>
                      <span style={{ color: logColor[l.type] }}>{l.msg}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>

            {/* open contract detail */}
            {openContract && (
              <div style={{ background: C.panel, borderRadius: 8, border: `1px solid ${C.yellow}44`, padding: "12px 20px", display: "flex", gap: 32, alignItems: "center", ...glowStyle(C.yellow) }}>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2 }}>OPEN CONTRACT</div>
                {[
                  ["ID", openContract.contract_id],
                  ["TYPE", openContract.contract_type],
                  ["ENTRY", fmt(openContract.entry_spot, 4)],
                  ["CURRENT", fmt(openContract.current_spot, 4)],
                  ["PROFIT", `${openContract.profit > 0 ? "+" : ""}${fmt(openContract.profit)}`],
                  ["PAYOUT", fmt(openContract.payout)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 9, color: C.muted, letterSpacing: 2 }}>{k}</div>
                    <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: k === "PROFIT" ? (openContract.profit >= 0 ? C.green : C.red) : C.white }}>{v}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{ padding: "12px 24px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted }}>
        <span>DERIV-X BOT · UNOFFICIAL INTEGRATION</span>
        <span>USE REAL-MONEY ACCOUNTS WITH CAUTION · TEST ON DEMO FIRST</span>
      </div>
    </div>
  );
}
