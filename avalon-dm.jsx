import React, { useState, useEffect, useRef } from "react";
import { apiRequest, uploadPlayerPhoto } from "./supabase-client.js";

/* ── 圆桌调色板 ───────────────────────────────── */
export const C = {
  ink: "#10101E",
  ink2: "#171730",
  panel: "#1C1C38",
  line: "#2E2E52",
  gold: "#C8A24C",
  goldDim: "#8A7038",
  vellum: "#E9E2D0",
  vellumInk: "#2A2418",
  azure: "#4C7BD9",
  crimson: "#A8323A",
  text: "#E4E2EE",
  dim: "#8483A6",
};
export const serif = { fontFamily: "Georgia, 'Times New Roman', serif" };
const mono = { fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace" };

/* 单手持握的一列，最宽 480 —— 桌面上居中，不铺满整屏 */
export const SHELL_W = 480;
const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;

const makePlayer = (seat) => ({
  id: `p${seat}_${Math.random().toString(36).slice(2, 8)}`,
  name: "",
  photo: null,
  photoPath: null,
  role: null,
  uploading: false,
  photoError: "",
});

function cropPlayerPhoto(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const side = Math.min(image.width, image.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 520;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("无法处理这张照片"));
        return;
      }
      context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 520, 520);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (blob) resolve(blob);
        else reject(new Error("无法压缩这张照片"));
      }, "image/jpeg", 0.78);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("无法读取这张照片"));
    };
    image.src = objectUrl;
  });
}

/* ── 规则表 ───────────────────────────────────── */
const SPLIT = {
  5: { good: 3, evil: 2 }, 6: { good: 4, evil: 2 }, 7: { good: 4, evil: 3 },
  8: { good: 5, evil: 3 }, 9: { good: 6, evil: 3 }, 10: { good: 6, evil: 4 },
};
const TEAM = {
  5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
};
const failsNeeded = (n, r) => (n >= 7 && r === 3 ? 2 : 1);

const ROLES = {
  merlin: { n: "梅林", side: "good", d: "只知道刺客与莫甘娜。别被刺客认出来。" },
  percival: { n: "派西维尔", side: "good", d: "知晓梅林与莫甘娜两人，但分不清谁是谁。" },
  servant: { n: "忠臣", side: "good", d: "亚瑟的忠臣。没有特殊情报，靠推理。" },
  assassin: { n: "刺客", side: "evil", d: "好人拿到三次成功后，由你指认梅林。" },
  morgana: { n: "莫甘娜", side: "evil", d: "在派西维尔眼中，你和梅林长得一样。" },
  mordred: { n: "莫德雷德", side: "evil", d: "梅林看不见你。" },
  oberon: { n: "奥伯伦", side: "evil", d: "你不认识其他坏人，他们也不认识你。" },
  minion: { n: "爪牙", side: "evil", d: "莫德雷德的爪牙。" },
};
const REVEAL_ORDER = ["oberon", "morgana", "assassin", "mordred", "minion", "merlin", "percival"];
const sideColor = (k) => (ROLES[k]?.side === "evil" ? C.crimson : C.azure);
const isEvil = (p) => ROLES[p?.role]?.side === "evil";
const isGood = (p) => ROLES[p?.role]?.side === "good";
const MERLIN_VISIBLE_ROLES = new Set(["assassin", "morgana"]);

function buildRoles(count, o) {
  const { good, evil } = SPLIT[count];
  let ev = ["assassin"];
  if (o.morgana) ev.push("morgana");
  if (o.mordred) ev.push("mordred");
  if (o.oberon) ev.push("oberon");
  ev = ev.slice(0, evil);
  while (ev.length < evil) ev.push("minion");
  const gd = ["merlin"];
  if (o.percival) gd.push("percival");
  while (gd.length < good) gd.push("servant");
  return [...gd.slice(0, good), ...ev];
}
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/* 每个角色在夜里能看到谁 */
export function knownTo(player, players) {
  const others = players.filter((p) => p.id !== player.id);
  const evils = others.filter(isEvil);
  switch (player.role) {
    case "merlin": return { label: "你能看见的邪恶角色", list: evils.filter((p) => MERLIN_VISIBLE_ROLES.has(p.role)) };
    case "percival": return { label: "这两人之一是梅林", list: shuffle(others.filter((p) => p.role === "merlin" || p.role === "morgana")) };
    case "oberon": return { label: "", list: [] };
    default:
      if (isEvil(player))
        return { label: "你的同伙", list: evils.filter((p) => p.role !== "oberon") };
      return { label: "", list: [] };
  }
}

/* ── 小组件 ───────────────────────────────────── */
function Avatar({ p, size = 64, ring, dim }) {
  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center"
      style={{
        width: size, height: size, flexShrink: 0,
        background: C.panel,
        border: `2px solid ${ring || C.line}`,
        opacity: dim ? 0.55 : 1,
        transition: "all .18s",
      }}
    >
      {p?.photo ? (
        <img src={p.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ ...serif, color: C.dim, fontSize: size * 0.36 }}>{p?.name?.[0] || "?"}</span>
      )}
    </div>
  );
}

function Btn({ children, onClick, disabled, tone = "gold", full, small }) {
  const bg = tone === "gold" ? C.gold : "transparent";
  const fg = tone === "gold" ? C.ink : C.text;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl active:scale-95 transition ${full ? "w-full" : ""}`}
      style={{
        background: disabled ? C.panel : bg,
        color: disabled ? C.dim : fg,
        border: tone === "gold" ? "none" : `1px solid ${C.line}`,
        padding: small ? "10px 16px" : "15px 22px",
        fontSize: small ? 14 : 16,
        fontWeight: 600,
        letterSpacing: "0.05em",
      }}
    >
      {children}
    </button>
  );
}

function Rule({ label }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div style={{ height: 1, background: C.line, flex: 1 }} />
      {label && <span style={{ ...serif, color: C.goldDim, fontSize: 12, letterSpacing: "0.28em" }}>{label}</span>}
      <div style={{ height: 1, background: C.line, flex: 1 }} />
    </div>
  );
}

function Shell({ eyebrow, title, children, footer, center, dbStatus, phase, onSignOut, players, peek, setPeek }) {
  return (
    <div style={{ background: C.ink, color: C.text, minHeight: "100dvh" }} className="flex justify-center">
      <div className="shell-col flex flex-col w-full" style={{ maxWidth: SHELL_W, minHeight: "100dvh" }}>
        <div className="px-5 pb-3" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "max(24px, env(safe-area-inset-top))" }}>
          <div style={{ ...serif, color: C.goldDim, fontSize: 11, letterSpacing: "0.34em" }}>{eyebrow}</div>
          <div className="flex items-end justify-between mt-1">
            <h1 style={{ ...serif, fontSize: 26, color: C.text, letterSpacing: "0.04em" }}>{title}</h1>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1" title="Supabase 云端保存状态">
                <span className="rounded-full" style={{ width: 7, height: 7, background: dbStatus === "offline" ? C.crimson : dbStatus === "saving" || dbStatus === "checking" ? C.gold : C.azure }} />
                <span style={{ color: C.dim, fontSize: 10 }}>
                  {dbStatus === "offline" ? "云端离线" : dbStatus === "saving" ? "同步中" : dbStatus === "checking" ? "连接中" : "已同步"}
                </span>
              </div>
              {phase === "setup" && onSignOut && (
                <button onClick={onSignOut} className="rounded-xl active:scale-95 transition"
                  style={{ border: `1px solid ${C.line}`, color: C.dim, padding: "7px 10px", fontSize: 11 }}>
                  退出
                </button>
              )}
              {players.some((p) => p.role) && phase !== "pass" && (
                <button
                  onPointerDown={() => setPeek(true)} onPointerUp={() => setPeek(false)}
                  onPointerLeave={() => setPeek(false)}
                  className="rounded-xl" style={{ border: `1px solid ${C.line}`, color: C.dim, padding: "7px 12px", fontSize: 12 }}
                >按住看底牌</button>
              )}
            </div>
          </div>
        </div>
        <div className={`flex-1 px-5 py-5 overflow-y-auto ${center ? "flex flex-col justify-center" : ""}`}>{children}</div>
        {footer && (
          <div className="px-5 pt-4" style={{ borderTop: `1px solid ${C.line}`, background: C.ink2, paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
            {footer}
          </div>
        )}
      </div>
      {peek && (
        <div className="fixed inset-0 p-5 overflow-y-auto" style={{ background: "rgba(6,6,14,.97)", zIndex: 50 }}>
          <div className="mx-auto w-full" style={{ maxWidth: SHELL_W }}>
            <div style={{ ...serif, color: C.gold, fontSize: 13, letterSpacing: "0.3em" }}>DM 底牌</div>
            <div className="mt-4 flex flex-col gap-2">
              {players.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl p-2" style={{ background: C.panel }}>
                  <Avatar p={p} size={42} ring={sideColor(p.role)} />
                  <div className="flex-1">
                    <div style={{ fontSize: 15 }}>{p.name}</div>
                    <div style={{ ...serif, fontSize: 13, color: sideColor(p.role) }}>{ROLES[p.role]?.n || "未分配"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 主程序 ───────────────────────────────────── */
export default function AvalonDM({ onSignOut }) {
  const [phase, setPhase] = useState("setup");
  const [count, setCount] = useState(7);
  const [players, setPlayers] = useState([]);
  const [opts, setOpts] = useState({ percival: true, morgana: true, mordred: false, oberon: false });
  const [dealMode, setDealMode] = useState("auto");
  const [saved, setSaved] = useState(null);

  const [passIdx, setPassIdx] = useState(0);
  const [sealBroken, setSealBroken] = useState(false);
  const [nightStep, setNightStep] = useState(0);
  const [peek, setPeek] = useState(false);

  const [round, setRound] = useState(0);
  const [step, setStep] = useState("leader");
  const [leader, setLeader] = useState(0);
  const [team, setTeam] = useState([]);
  const [votes, setVotes] = useState({});
  const [rejects, setRejects] = useState(0);
  const [history, setHistory] = useState([]);
  const [missionResult, setMissionResult] = useState(null);
  const [winner, setWinner] = useState(null);
  const [killed, setKilled] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [dbStatus, setDbStatus] = useState("checking");
  const [startingGame, setStartingGame] = useState(false);
  const [clearingPlayers, setClearingPlayers] = useState(false);
  const [playerMessage, setPlayerMessage] = useState("");

  const fileRef = useRef(null);
  const pendingRef = useRef(null);

  /* 上次的玩家名单 */
  useEffect(() => {
    (async () => {
      let roster = null;
      try {
        const data = await apiRequest("/players/recent");
        setDbStatus("ready");
        if (data.players?.length) roster = data.players;
      } catch (e) {
        setDbStatus("offline");
      }

      if (!roster) {
        try {
          if (window.storage) {
            const r = await window.storage.get("avalon:roster");
            roster = r ? JSON.parse(r.value)?.players : null;
          } else {
            roster = JSON.parse(window.localStorage.getItem("avalon:roster") || "null")?.players;
          }
        } catch (e) { /* 没有本地存档 */ }
      }
      if (roster?.length) setSaved(roster.slice(0, MAX_PLAYERS));
    })();
  }, []);

  useEffect(() => {
    setPlayers((prev) => {
      const next = [];
      for (let i = 0; i < count; i++) next.push(prev[i] || makePlayer(i));
      return next;
    });
  }, [count]);

  const setP = (i, patch) => setPlayers((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const setPlayerById = (id, patch) => setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const openCamera = (i) => { pendingRef.current = i; fileRef.current?.click(); };
  const onFile = async (e) => {
    const f = e.target.files?.[0]; const i = pendingRef.current;
    e.target.value = "";
    if (!f || i == null) return;
    const playerId = players[i]?.id;
    if (!playerId) return;

    setPlayerMessage("");
    setPlayerById(playerId, { uploading: true, photoError: "" });
    setDbStatus("saving");
    try {
      const jpegBlob = await cropPlayerPhoto(f);
      const uploaded = await uploadPlayerPhoto(playerId, jpegBlob);
      setPlayerById(playerId, {
        photo: uploaded.signedUrl,
        photoPath: uploaded.path,
        uploading: false,
        photoError: "",
      });
      setDbStatus("saved");
      setPlayerMessage("照片已安全上传到 Supabase");
    } catch (error) {
      console.error("Player photo upload failed", error);
      setPlayerById(playerId, { uploading: false, photoError: "上传失败，点头像重试" });
      setDbStatus("offline");
      setPlayerMessage(error?.message || "照片上传失败");
    }
  };

  const saveRoster = async (list) => {
    const clean = list.slice(0, MAX_PLAYERS).map(({ id, name, photoPath }) => ({ id, name: name.trim(), photoPath: photoPath || null }));
    try {
      const value = JSON.stringify({ players: clean });
      if (window.storage) await window.storage.set("avalon:roster", value);
      else window.localStorage.setItem("avalon:roster", value);
    } catch (e) { /* 本地存不下仍可继续 */ }

    setDbStatus("saving");
    try {
      await apiRequest("/players/sync", { method: "POST", body: JSON.stringify({ players: clean }) });
      setDbStatus("saved");
    } catch (e) {
      setDbStatus("offline");
    }
  };

  const clearPlayerProfiles = async () => {
    if (clearingPlayers || !window.confirm("清除目前玩家名单和所有玩家照片？对局历史会保留，但照片不会保留。")) return;
    setClearingPlayers(true);
    setPlayerMessage("");
    setDbStatus("saving");
    try {
      const result = await apiRequest("/players/clear", { method: "POST" });
      if (window.storage?.delete) await window.storage.delete("avalon:roster");
      else if (window.storage?.set) await window.storage.set("avalon:roster", JSON.stringify({ players: [] }));
      window.localStorage.removeItem("avalon:roster");
      setSaved(null);
      setPlayers(Array.from({ length: count }, (_, i) => makePlayer(i)));
      setDbStatus(result.storageWarning ? "offline" : "saved");
      setPlayerMessage(result.storageWarning ? "玩家资料已清除，但部分照片文件稍后需要重试删除" : "玩家资料和照片已清除，可以输入下一场玩家");
    } catch (error) {
      console.error("Clear player profiles failed", error);
      setDbStatus("offline");
      setPlayerMessage(error?.message || "清除玩家资料失败");
    } finally {
      setClearingPlayers(false);
    }
  };

  const persist = async (path, options) => {
    setDbStatus("saving");
    try {
      const data = await apiRequest(path, options);
      setDbStatus("saved");
      return data;
    } catch (e) {
      console.error("Supabase write failed", e);
      setDbStatus("offline");
      return null;
    }
  };

  const composition = buildRoles(count, opts);
  const evilSlots = SPLIT[count].evil;
  const wantedEvil = 1 + (opts.morgana ? 1 : 0) + (opts.mordred ? 1 : 0) + (opts.oberon ? 1 : 0);
  const overflow = wantedEvil > evilSlots;

  const startDeal = () => {
    setNightStep(0);
    if (dealMode === "auto") {
      const rs = shuffle(composition);
      setPlayers((ps) => ps.map((p, i) => ({ ...p, role: rs[i] })));
      setPassIdx(0); setSealBroken(false); setPhase("pass");
    } else {
      setPlayers((ps) => ps.map((p) => ({ ...p, role: null })));
      setPhase("night");
    }
  };

  const startGame = async () => {
    if (startingGame) return;
    setStartingGame(true);
    let gamePlayers = players;
    if (dealMode === "manual") {
      const remainingRoles = [...composition];
      players.forEach((p) => {
        const i = remainingRoles.indexOf(p.role);
        if (i >= 0) remainingRoles.splice(i, 1);
      });
      let nextRole = 0;
      gamePlayers = players.map((p) => p.role ? p : { ...p, role: remainingRoles[nextRole++] || "servant" });
      setPlayers(gamePlayers);
    }
    setRound(0); setStep("leader"); setLeader(Math.floor(Math.random() * count));
    setTeam([]); setVotes({}); setRejects(0); setHistory([]); setMissionResult(null); setWinner(null); setKilled(null);
    setGameId(null);

    const gamePayload = gamePlayers.map(({ id, name, role, photoPath }) => ({ id, name, role, photoPath: photoPath || null }));
    const created = await persist("/games", {
      method: "POST",
      body: JSON.stringify({ players: gamePayload, dealMode, options: opts }),
    });
    if (created?.id) setGameId(String(created.id));
    setPhase("game");
    setStartingGame(false);
  };

  const resetAll = () => {
    setPlayers((ps) => ps.map((p) => ({ ...p, role: null })));
    setGameId(null);
    setPhase("setup");
  };

  const finishPersistedGame = (nextWinner, killedPlayerId = null) => {
    if (!gameId) return;
    void persist(`/games/${gameId}/finish`, {
      method: "PATCH",
      body: JSON.stringify({ winner: nextWinner, killedPlayerId }),
    });
  };

  /* ── 任务流程 ── */
  const teamSize = TEAM[count][round];
  const need = failsNeeded(count, round);
  const yes = Object.values(votes).filter(Boolean).length;
  const no = Object.keys(votes).length - yes;

  const confirmVote = () => {
    setStep("voteResult");
  };

  const submitMission = (fails) => {
    const ok = fails < need;
    setMissionResult({ fails, ok });
    setStep("missionResult");
  };

  const continueAfterVote = () => {
    if (gameId) {
      void persist(`/games/${gameId}/proposals`, {
        method: "POST",
        body: JSON.stringify({
          roundNumber: round + 1,
          attemptNumber: rejects + 1,
          leaderPlayerId: players[leader].id,
          teamPlayerIds: team,
          votes,
          approved: yes > no,
        }),
      });
    }
    if (yes > no) { setStep("mission"); return; }
    const r = rejects + 1;
    if (r >= 5) {
      setWinner("evil-vote");
      finishPersistedGame("evil-vote");
      setPhase("end");
      return;
    }
    setRejects(r); setLeader((leader + 1) % count); setTeam([]); setVotes({}); setStep("leader");
  };

  const continueAfterMission = () => {
    if (!missionResult) return;
    const { fails, ok } = missionResult;
    const h = [...history, { fails, ok, team, leader }];
    setHistory(h);
    if (gameId) {
      void persist(`/games/${gameId}/rounds`, {
        method: "POST",
        body: JSON.stringify({
          roundNumber: round + 1,
          leaderPlayerId: players[leader].id,
          teamPlayerIds: team,
          fails,
          succeeded: ok,
        }),
      });
    }
    const wins = h.filter((x) => x.ok).length, loses = h.length - wins;
    setRejects(0); setTeam([]); setVotes({}); setMissionResult(null); setLeader((leader + 1) % count);
    if (loses >= 3) {
      setWinner("evil-mission");
      finishPersistedGame("evil-mission");
      setPhase("end");
      return;
    }
    if (wins >= 3) { setPhase("assassin"); return; }
    setRound(round + 1); setStep("leader");
  };

  const doAssassinate = (p) => {
    setKilled(p);
    const nextWinner = p.role === "merlin" ? "evil-assassin" : "good";
    setWinner(nextWinner);
    finishPersistedGame(nextWinner, p.id);
    setPhase("end");
  };

  /* ── 夜晚脚本 ── */
  const buildNight = () => {
    const inDeck = (k) => composition.includes(k);
    const by = (f) => players.filter(f);
    const s = [{ t: "闭眼", x: "所有人闭上眼睛，握拳，伸出大拇指。", who: [] }];

    if (dealMode === "manual") {
      const addConfirm = (role, occurrence = 0) => s.push({
        type: "confirm",
        role,
        occurrence,
        t: `确认${ROLES[role].n}${occurrence ? ` ${occurrence + 1}` : ""}`,
        x: `请${ROLES[role].n}单独睁眼。确认后，由 DM 在下方点选对应玩家。`,
        who: by((p) => p.role === role)[occurrence] ? [by((p) => p.role === role)[occurrence]] : [],
      });

      ["oberon", "morgana", "assassin", "mordred", "minion"].forEach((role) => {
        const total = composition.filter((k) => k === role).length;
        for (let i = 0; i < total; i++) addConfirm(role, i);
      });
    }

    s.push({
      t: "坏人相认",
      x: `邪恶阵营睁眼，互相确认${inDeck("oberon") ? "（奥伯伦不睁眼，也不被看到）" : ""}。确认完毕后闭眼、握拳。`,
      who: by((p) => isEvil(p) && p.role !== "oberon"),
    });

    if (dealMode === "manual") {
      s.push({
        type: "confirm",
        role: "merlin",
        occurrence: 0,
        t: "确认梅林",
        x: "请梅林单独睁眼。确认后，由 DM 在下方点选对应玩家。",
        who: by((p) => p.role === "merlin"),
      });
    }

    s.push({
      t: "梅林确认坏人",
      x: `所有坏人${inDeck("mordred") ? "（莫德雷德除外）" : ""}伸出大拇指。梅林睁眼，记下这些人。随后坏人收回拇指，梅林闭眼。`,
      who: by((p) => isEvil(p) && p.role !== "mordred"),
    });

    if (dealMode === "manual" && inDeck("percival")) {
      s.push({
        type: "confirm",
        role: "percival",
        occurrence: 0,
        t: "确认派西维尔",
        x: "请派西维尔单独睁眼。确认后，由 DM 在下方点选对应玩家。",
        who: by((p) => p.role === "percival"),
      });
    }

    if (inDeck("percival"))
      s.push({
        t: "派西维尔确认",
        x: "梅林与莫甘娜伸出大拇指。派西维尔睁眼，记下这两人——他分不清谁是梅林。随后二人收回拇指，派西维尔闭眼。",
        who: by((p) => p.role === "merlin" || p.role === "morgana"),
      });
    s.push({ t: "天亮", x: "所有人睁眼。任务开始。", who: [] });
    return s;
  };

  const nightRolePlayer = (night) => {
    if (!night?.role) return null;
    return players.filter((p) => p.role === night.role)[night.occurrence || 0] || null;
  };

  const assignNightRole = (night, playerId) => {
    const current = nightRolePlayer(night);
    setPlayers((ps) => ps.map((p) => {
      if (p.id === current?.id) return { ...p, role: null };
      if (p.id === playerId) return { ...p, role: night.role };
      return p;
    }));
  };

  const shellProps = { dbStatus, phase, onSignOut, players, peek, setPeek };

  /* ═══════════ 玩家录入 ═══════════ */
  if (phase === "setup") {
    const uploadingPhotos = players.some((p) => p.uploading);
    const ready = count >= MIN_PLAYERS && count <= MAX_PLAYERS
      && players.length === count
      && players.every((p) => p.name.trim())
      && !uploadingPhotos;
    return (
      <Shell {...shellProps} eyebrow="AVALON · 主持人" title="入座"
        footer={
          <div>
            <Btn full disabled={!ready} onClick={async () => { await saveRoster(players); setPhase("roles"); }}>
              {uploadingPhotos ? "照片上传中…" : ready ? "名单齐了，配角色" : "还有人没填名字"}
            </Btn>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 8, textAlign: "center" }}>每局 5–10 人；头像可以先跳过，之后随时补拍</div>
          </div>
        }>
        <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={onFile} style={{ display: "none" }} />
        <div style={{ ...serif, color: C.dim, fontSize: 14, lineHeight: 1.7 }}>
          把手机依次传给每个人，让他们拍下自己、写上名字。之后这一晚，你都靠这些头像认人。
        </div>
        {saved && (
          <button onClick={() => {
            const savedCount = Math.min(Math.max(saved.length, MIN_PLAYERS), MAX_PLAYERS);
            setCount(savedCount);
            setPlayers(saved.slice(0, savedCount).map((s) => ({ ...s, photoPath: s.photoPath || s.photo_path || null, role: null, uploading: false, photoError: "" })));
            setSaved(null);
          }}
            className="w-full rounded-xl mt-4 active:scale-95 transition"
            style={{ border: `1px dashed ${C.goldDim}`, color: C.gold, padding: "12px", fontSize: 14 }}>
            载入上次的 {saved.length} 位玩家
          </button>
        )}
        <button
          type="button"
          onClick={clearPlayerProfiles}
          disabled={clearingPlayers || uploadingPhotos}
          className="w-full rounded-xl mt-3 active:scale-95 transition"
          style={{ border: `1px solid ${C.line}`, color: clearingPlayers ? C.dim : C.crimson, padding: "11px", fontSize: 13 }}
        >
          {clearingPlayers ? "正在清除…" : "清除玩家资料，换一批玩家"}
        </button>
        {playerMessage && (
          <div role="status" className="rounded-xl mt-3 px-3 py-2" style={{ background: C.panel, color: dbStatus === "offline" ? C.crimson : C.azure, fontSize: 12, lineHeight: 1.6 }}>
            {playerMessage}
          </div>
        )}
        <Rule label="人数" />
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => (
            <button key={n} onClick={() => setCount(n)} className="rounded-xl active:scale-95 transition"
              style={{ padding: "13px 0", background: count === n ? C.gold : C.panel, color: count === n ? C.ink : C.dim, border: `1px solid ${count === n ? C.gold : C.line}`, ...mono, fontSize: 16, fontWeight: 700 }}>
              {n}
            </button>
          ))}
        </div>
        <div style={{ color: C.dim, fontSize: 13, marginTop: 10 }}>
          {SPLIT[count].good} 位好人 · {SPLIT[count].evil} 位坏人
        </div>
        <Rule label="玩家" />
        <div className="flex flex-col gap-3">
          {players.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3">
              <button type="button" onClick={() => openCamera(i)} disabled={p.uploading} aria-label={`为 ${p.name || `${i + 1} 号位`} 拍照`} className="active:scale-95 transition">
                <Avatar p={p} size={56} ring={p.photo ? C.gold : C.line} />
              </button>
              <div className="flex-1">
                <input
                  value={p.name} onChange={(e) => setP(i, { name: e.target.value })}
                  placeholder={`${i + 1} 号位`}
                  maxLength={80}
                  className="w-full rounded-xl"
                  style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.text, padding: "13px 14px", fontSize: 16, outline: "none", transition: "border-color .18s" }}
                  onFocus={(e) => (e.target.style.borderColor = C.gold)}
                  onBlur={(e) => (e.target.style.borderColor = C.line)}
                />
                {(p.uploading || p.photoError) && (
                  <div style={{ color: p.photoError ? C.crimson : C.gold, fontSize: 11, marginTop: 4 }}>
                    {p.uploading ? "正在上传照片…" : p.photoError}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  /* ═══════════ 角色配置 ═══════════ */
  if (phase === "roles") {
    const Toggle = ({ k, label, hint }) => (
      <button onClick={() => setOpts((o) => ({ ...o, [k]: !o[k] }))}
        className="w-full rounded-xl flex items-center gap-3 active:scale-95 transition"
        style={{ background: C.panel, border: `1px solid ${opts[k] ? C.goldDim : C.line}`, padding: "14px" }}>
        <div className="rounded-full" style={{ width: 20, height: 20, border: `2px solid ${opts[k] ? C.gold : C.line}`, background: opts[k] ? C.gold : "transparent" }} />
        <div className="text-left flex-1">
          <div style={{ ...serif, fontSize: 16 }}>{label}</div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{hint}</div>
        </div>
      </button>
    );
    return (
      <Shell {...shellProps} eyebrow="AVALON · 主持人" title="配置角色"
        footer={
          <div className="flex flex-col gap-2">
            {overflow && <div style={{ color: C.crimson, fontSize: 13 }}>坏人位只有 {evilSlots} 个，多选的特殊角色会被忽略。</div>}
            <Btn full onClick={startDeal}>{dealMode === "auto" ? "开始发牌" : "进入夜晚确认"}</Btn>
            <Btn full tone="ghost" small onClick={() => setPhase("setup")}>返回改名单</Btn>
          </div>
        }>
        <Toggle k="percival" label="派西维尔" hint="他能看到梅林和莫甘娜，但分不清" />
        <div className="h-2" />
        <Toggle k="morgana" label="莫甘娜" hint="伪装成梅林，通常和派西维尔一起用" />
        <div className="h-2" />
        <Toggle k="mordred" label="莫德雷德" hint="梅林看不见他，好人会变得很难" />
        <div className="h-2" />
        <Toggle k="oberon" label="奥伯伦" hint="孤狼坏人，谁也不认识谁" />

        <Rule label="本局牌堆" />
        <div className="flex flex-wrap gap-2">
          {composition.map((k, i) => (
            <span key={i} className="rounded-full" style={{ ...serif, fontSize: 13, padding: "7px 13px", color: sideColor(k), border: `1px solid ${sideColor(k)}44`, background: C.panel }}>
              {ROLES[k].n}
            </span>
          ))}
        </div>

        <Rule label="怎么分身份" />
        <div className="flex gap-2">
          {[["auto", "App 发牌", "手机传一圈，各自拆封"], ["manual", "实体牌", "夜晚逐个确认角色"]].map(([k, t, s]) => (
            <button key={k} onClick={() => setDealMode(k)} className="flex-1 rounded-xl text-left active:scale-95 transition"
              style={{ background: C.panel, border: `1px solid ${dealMode === k ? C.gold : C.line}`, padding: 14 }}>
              <div style={{ ...serif, fontSize: 15, color: dealMode === k ? C.gold : C.text }}>{t}</div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>{s}</div>
            </button>
          ))}
        </div>
      </Shell>
    );
  }

  /* ═══════════ 传阅身份（蜡封） ═══════════ */
  if (phase === "pass") {
    const p = players[passIdx];
    const info = knownTo(p, players);
    const last = passIdx === players.length - 1;
    return (
      <Shell {...shellProps} eyebrow={`第 ${passIdx + 1} / ${players.length} 位`} title={sealBroken ? "你的身份" : "请传给"} center>
        {!sealBroken ? (
          <div className="flex flex-col items-center" style={{ paddingTop: 18 }}>
            <Avatar p={p} size={110} ring={C.goldDim} />
            <div style={{ ...serif, fontSize: 30, marginTop: 18 }}>{p.name}</div>
            <div style={{ color: C.dim, fontSize: 14, marginTop: 8, textAlign: "center", lineHeight: 1.7 }}>
              确认手机在你自己手上，<br />再按下火漆印。
            </div>
            <button onClick={() => setSealBroken(true)} className="rounded-full active:scale-90 transition"
              style={{ marginTop: 34, width: 116, height: 116, background: C.crimson, border: `3px solid ${C.gold}`, boxShadow: "0 10px 30px rgba(168,50,58,.35)" }}>
              <span style={{ ...serif, fontSize: 42, color: C.vellum }}>A</span>
            </button>
            <div style={{ ...serif, color: C.goldDim, fontSize: 12, letterSpacing: "0.3em", marginTop: 16 }}>拆 封</div>
          </div>
        ) : (
          <div className="rounded-2xl p-5" style={{ background: C.vellum, color: C.vellumInk }}>
            <div style={{ ...serif, fontSize: 11, letterSpacing: "0.3em", color: "#7A6A45" }}>{p.name}，你是</div>
            <div style={{ ...serif, fontSize: 38, marginTop: 6, color: sideColor(p.role) }}>{ROLES[p.role].n}</div>
            <div style={{ fontSize: 14, marginTop: 10, lineHeight: 1.7 }}>{ROLES[p.role].d}</div>
            <div style={{ height: 1, background: "#C9BE9E", margin: "18px 0" }} />
            {info.list.length ? (
              <>
                <div style={{ ...serif, fontSize: 12, letterSpacing: "0.2em", color: "#7A6A45" }}>{info.label}</div>
                <div className="flex flex-wrap gap-3 mt-3">
                  {info.list.map((q) => (
                    <div key={q.id} className="flex flex-col items-center" style={{ width: 68 }}>
                      <Avatar p={q} size={62} ring="#B9A87C" />
                      <div style={{ fontSize: 12, marginTop: 6, textAlign: "center" }}>{q.name}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: "#6B5F44" }}>你今晚看不到任何人。靠嘴和脑子。</div>
            )}
          </div>
        )}
        <div style={{ height: 20 }} />
        {sealBroken && (
          <Btn full onClick={() => {
            if (last) setPhase("night"); else { setPassIdx(passIdx + 1); setSealBroken(false); }
          }}>
            {last ? "全部看完，进入夜晚" : "记住了，传给下一位"}
          </Btn>
        )}
      </Shell>
    );
  }

  /* ═══════════ 夜晚仪式 ═══════════ */
  if (phase === "night") {
    const nightSteps = buildNight();
    const s = nightSteps[Math.min(nightStep, nightSteps.length - 1)];
    const last = nightStep >= nightSteps.length - 1;
    const confirmed = nightRolePlayer(s);
    const needsAssignment = dealMode === "manual" && s.type === "confirm";
    return (
      <Shell {...shellProps} eyebrow={`夜晚 · ${nightStep + 1} / ${nightSteps.length}`} title={s.t} center
        footer={
          <div className="flex gap-2">
            {nightStep > 0 && <Btn tone="ghost" small onClick={() => setNightStep(nightStep - 1)}>上一步</Btn>}
            <div className="flex-1">
              <Btn full disabled={(needsAssignment && !confirmed) || startingGame} onClick={() => (last ? startGame() : setNightStep(nightStep + 1))}>
                {startingGame ? "正在建立本局记录…" : needsAssignment && !confirmed ? `请先选择${ROLES[s.role].n}` : last ? "开始第一轮任务" : "确认，下一步"}
              </Btn>
            </div>
          </div>
        }>
        <div style={{ ...serif, fontSize: 20, lineHeight: 1.85 }}>{s.x}</div>
        {needsAssignment && (
          <>
            <Rule label={confirmed ? "已确认，可重新选择" : "DM 点选对应玩家"} />
            <div className="grid grid-cols-3 gap-3">
              {players.map((p) => {
                const selected = confirmed?.id === p.id;
                const assignedElsewhere = Boolean(p.role) && !selected;
                return (
                  <button key={p.id} disabled={assignedElsewhere}
                    onClick={() => assignNightRole(s, p.id)}
                    className="flex flex-col items-center active:scale-95 transition"
                    style={{ opacity: assignedElsewhere ? 0.28 : 1 }}>
                    <Avatar p={p} size={72} ring={selected ? sideColor(s.role) : C.line} dim={!selected && !assignedElsewhere} />
                    <div style={{ fontSize: 13, marginTop: 6 }}>{p.name}</div>
                    <div style={{ ...serif, fontSize: 12, color: selected ? sideColor(s.role) : C.dim }}>
                      {selected ? ROLES[s.role].n : assignedElsewhere ? "已确认其他身份" : "点选"}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {!needsAssignment && s.who.length > 0 && (
          <>
            <Rule label="此刻该有动作的人" />
            <div className="flex flex-wrap gap-4">
              {s.who.map((q) => (
                <div key={q.id} className="flex flex-col items-center" style={{ width: 74 }}>
                  <Avatar p={q} size={68} ring={sideColor(q.role)} />
                  <div style={{ fontSize: 13, marginTop: 6 }}>{q.name}</div>
                </div>
              ))}
            </div>
            <div style={{ color: C.dim, fontSize: 13, marginTop: 14, lineHeight: 1.7 }}>
              只有你看得到这一屏。抬头核对一下，有人没照做就重念一遍。
            </div>
          </>
        )}
        {dealMode === "auto" && nightStep === 0 && (
          <button onClick={startGame} disabled={startingGame} className="w-full rounded-xl mt-6"
            style={{ border: `1px dashed ${C.line}`, color: C.dim, padding: 12, fontSize: 13, opacity: startingGame ? 0.5 : 1 }}>
            {startingGame ? "正在建立本局记录…" : "大家已在手机上看过情报，跳过夜晚"}
          </button>
        )}
      </Shell>
    );
  }

  /* ═══════════ 任务流程 ═══════════ */
  if (phase === "game") {
    const ld = players[leader];
    const confirmedRoles = REVEAL_ORDER.flatMap((role) => players.filter((p) => p.role === role));
    const roundFlow = [
      ["leader", "交队长"], ["team", "组队"], ["vote", "投票"],
      ["voteResult", "票决"], ["mission", "任务"], ["missionResult", "结果"],
    ];
    const flowIndex = roundFlow.findIndex(([k]) => k === step);
    const votePassed = yes > no;
    const visibleRejects = rejects + (step === "voteResult" && !votePassed ? 1 : 0);
    const projectedHistory = missionResult ? [...history, missionResult] : history;
    const projectedWins = projectedHistory.filter((h) => h.ok).length;
    const projectedLosses = projectedHistory.length - projectedWins;
    const actionText = {
      leader: `把队长标记交给 ${ld.name}，并宣布本轮需要 ${teamSize} 人执行任务。`,
      team: `请 ${ld.name} 提名 ${teamSize} 位玩家。DM 在下方点选他们。`,
      vote: "请全员同时亮出赞成或反对牌，然后由 DM 逐个记录。",
      voteResult: votePassed
        ? `向全员宣布：${yes} 比 ${no}，组队通过。`
        : `向全员宣布：${yes} 比 ${no}，组队被否决。`,
      mission: `请 ${teamSize} 位任务成员各交一张任务牌。收齐后洗混，并统计失败牌。`,
      missionResult: missionResult?.ok
        ? `向全员宣布：任务成功，共有 ${missionResult.fails} 张失败牌。`
        : `向全员宣布：任务失败，共有 ${missionResult?.fails} 张失败牌。`,
    }[step];

    let gameFooter = null;
    if (step === "leader") {
      gameFooter = <Btn full onClick={() => setStep("team")}>队长已交接，开始组队</Btn>;
    } else if (step === "team") {
      gameFooter = (
        <Btn full disabled={team.length !== teamSize} onClick={() => { setVotes({}); setStep("vote"); }}>
          {team.length}/{teamSize} 人 · 确认队伍并投票
        </Btn>
      );
    } else if (step === "vote") {
      gameFooter = (
        <Btn full disabled={Object.keys(votes).length !== count} onClick={confirmVote}>
          {Object.keys(votes).length === count ? "查看并宣布投票结果" : `还有 ${count - Object.keys(votes).length} 人没投`}
        </Btn>
      );
    } else if (step === "voteResult") {
      gameFooter = (
        <Btn full onClick={continueAfterVote}>
          {votePassed ? "宣布完毕，进入任务" : rejects + 1 >= 5 ? "宣布第五次否决结果" : "宣布完毕，交接下一位队长"}
        </Btn>
      );
    } else if (step === "missionResult") {
      gameFooter = (
        <Btn full onClick={continueAfterMission}>
          {projectedLosses >= 3 ? "宣布完毕，查看胜负" : projectedWins >= 3 ? "宣布完毕，进入刺杀" : "宣布完毕，进入下一轮"}
        </Btn>
      );
    }

    return (
      <Shell {...shellProps} eyebrow={`第 ${round + 1} 轮任务 · 需 ${teamSize} 人${need === 2 ? " · 需 2 张失败牌" : ""}`}
        title={roundFlow[flowIndex]?.[1] || "任务流程"}
        footer={gameFooter}>
        {dealMode === "manual" && (
          <>
            <div className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.goldDim}` }}>
              <div style={{ ...serif, color: C.goldDim, fontSize: 11, letterSpacing: "0.28em" }}>夜晚确认名单</div>
              <div className="flex flex-col gap-2 mt-3">
                {confirmedRoles.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-4">
                    <span style={{ ...serif, color: sideColor(p.role), fontSize: 15 }}>{ROLES[p.role].n}</span>
                    <span style={{ fontSize: 15 }}>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <Rule />
          </>
        )}
        {/* 战绩 */}
        <div className="flex items-center gap-2">
          {TEAM[count].map((sz, i) => {
            const h = history[i] || (i === round ? missionResult : null);
            const bg = h ? (h.ok ? C.azure : C.crimson) : i === round ? C.panel : "transparent";
            return (
              <div key={i} className="rounded-full flex items-center justify-center"
                style={{ width: 42, height: 42, background: bg, border: `1px solid ${h ? bg : i === round ? C.gold : C.line}`, ...mono, fontSize: 14, color: h ? "#fff" : C.dim }}>
                {sz}{failsNeeded(count, i) === 2 && <span style={{ fontSize: 9, marginLeft: 1 }}>✦</span>}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-1 mt-3">
          <span style={{ fontSize: 12, color: C.dim, marginRight: 6 }}>连续否决</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-full" style={{ width: 9, height: 9, background: i < visibleRejects ? C.crimson : C.line }} />
          ))}
        </div>

        <Rule label="本轮流程" />
        <div className="grid grid-cols-6 gap-1">
          {roundFlow.map(([k, label], i) => (
            <div key={k} className="rounded-lg flex flex-col items-center justify-center"
              style={{ minHeight: 48, background: i === flowIndex ? C.gold : i < flowIndex ? C.panel : "transparent", border: `1px solid ${i === flowIndex ? C.gold : C.line}` }}>
              <span style={{ ...mono, fontSize: 10, color: i === flowIndex ? C.ink : C.dim }}>{i + 1}</span>
              <span style={{ fontSize: 11, color: i === flowIndex ? C.ink : i < flowIndex ? C.text : C.dim, marginTop: 2 }}>{label}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl p-4 mt-4" style={{ background: C.ink2, border: `1px solid ${C.goldDim}` }}>
          <div style={{ ...serif, color: C.gold, fontSize: 11, letterSpacing: "0.24em" }}>DM 现在要做</div>
          <div style={{ ...serif, fontSize: 18, lineHeight: 1.75, marginTop: 8 }}>{actionText}</div>
        </div>

        <Rule label="当前队长" />
        <div className="flex items-center gap-3">
          <Avatar p={ld} size={52} ring={C.gold} />
          <div>
            <div style={{ ...serif, fontSize: 19 }}>{ld.name}</div>
            <div style={{ fontSize: 13, color: C.dim }}>由他挑选 {teamSize} 人出任务</div>
          </div>
        </div>

        {(step === "team" || step === "vote") && (
          <>
            <Rule label={step === "vote" ? "逐个记录投票" : "点选出队的人"} />
            <div className="grid grid-cols-3 gap-3">
              {players.map((p) => {
                const on = team.includes(p.id);
                const v = votes[p.id];
                const ring = step === "vote" ? (v === true ? C.azure : v === false ? C.crimson : C.line) : on ? C.gold : C.line;
                return (
                  <button key={p.id} className="flex flex-col items-center active:scale-95 transition"
                    onClick={() => {
                      if (step === "team") {
                        setTeam(on ? team.filter((x) => x !== p.id) : team.length < teamSize ? [...team, p.id] : team);
                      } else {
                        setVotes((vv) => {
                          const next = { ...vv };
                          if (!(p.id in next)) next[p.id] = true;
                          else if (next[p.id] === true) next[p.id] = false;
                          else delete next[p.id];
                          return next;
                        });
                      }
                    }}>
                    <Avatar p={p} size={72} ring={ring} dim={step === "team" && !on} />
                    <div style={{ fontSize: 13, marginTop: 6 }}>{p.name}</div>
                    {step === "vote" && <div style={{ fontSize: 12, color: ring }}>{v === true ? "赞成" : v === false ? "反对" : "未投"}</div>}
                    {step === "team" && on && <div style={{ fontSize: 12, color: C.gold }}>出任务</div>}
                  </button>
                );
              })}
            </div>
            {step === "vote" && <div style={{ color: C.dim, fontSize: 12, marginTop: 12 }}>连点切换：未投 → 赞成 → 反对</div>}
          </>
        )}

        {step === "voteResult" && (
          <>
            <Rule label="投票结果" />
            <div className="rounded-2xl p-5 text-center" style={{ background: C.panel, border: `1px solid ${votePassed ? C.azure : C.crimson}` }}>
              <div style={{ ...mono, fontSize: 30, color: votePassed ? C.azure : C.crimson }}>{yes} : {no}</div>
              <div style={{ ...serif, fontSize: 22, marginTop: 8 }}>{votePassed ? "组队通过" : "组队被否决"}</div>
              {!votePassed && <div style={{ color: C.dim, fontSize: 13, marginTop: 8 }}>这是连续第 {rejects + 1} 次否决</div>}
            </div>
          </>
        )}

        {step === "mission" && (
          <>
            <Rule label="本轮任务成员" />
            <div className="flex flex-wrap gap-3">
              {players.filter((p) => team.includes(p.id)).map((p) => (
                <div key={p.id} className="flex flex-col items-center" style={{ width: 68 }}>
                  <Avatar p={p} size={62} ring={C.gold} />
                  <div style={{ fontSize: 12, marginTop: 6 }}>{p.name}</div>
                </div>
              ))}
            </div>
            <Rule label="收上来几张失败牌" />
            <div style={{ color: C.dim, fontSize: 14, marginBottom: 12 }}>
              本轮 {need === 2 ? "需要 2 张失败牌才算任务失败。" : "只要 1 张失败牌，任务就失败。"}
            </div>
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: teamSize + 1 }, (_, i) => i).map((f) => (
                <button key={f} onClick={() => submitMission(f)} className="rounded-xl active:scale-95 transition"
                  style={{ width: 62, padding: "16px 0", background: C.panel, border: `1px solid ${C.line}`, color: C.text, ...mono, fontSize: 20 }}>
                  {f}
                </button>
              ))}
            </div>
          </>
        )}

        {step === "missionResult" && missionResult && (
          <>
            <Rule label="任务结果" />
            <div className="rounded-2xl p-5 text-center" style={{ background: C.panel, border: `1px solid ${missionResult.ok ? C.azure : C.crimson}` }}>
              <div style={{ ...serif, fontSize: 26, color: missionResult.ok ? C.azure : C.crimson }}>{missionResult.ok ? "任务成功" : "任务失败"}</div>
              <div style={{ ...mono, fontSize: 15, color: C.dim, marginTop: 10 }}>{missionResult.fails} 张失败牌</div>
            </div>
          </>
        )}
      </Shell>
    );
  }

  /* ═══════════ 刺杀 ═══════════ */
  if (phase === "assassin") {
    const ass = players.find((p) => p.role === "assassin");
    return (
      <Shell {...shellProps} eyebrow="好人已完成三次任务" title="刺客出手">
        <div className="flex items-center gap-3">
          <Avatar p={ass} size={56} ring={C.crimson} />
          <div style={{ ...serif, fontSize: 18 }}>{ass.name} 是刺客</div>
        </div>
        <div style={{ color: C.dim, fontSize: 14, lineHeight: 1.7, marginTop: 14 }}>
          让他当众指认梅林。指错了，好人赢；指对了，坏人翻盘。
        </div>
        <Rule label="他指的是" />
        <div className="grid grid-cols-3 gap-3">
          {players.filter(isGood).map((p) => (
            <button key={p.id} onClick={() => doAssassinate(p)} className="flex flex-col items-center active:scale-95 transition">
              <Avatar p={p} size={72} ring={C.line} />
              <div style={{ fontSize: 13, marginTop: 6 }}>{p.name}</div>
            </button>
          ))}
        </div>
      </Shell>
    );
  }

  /* ═══════════ 结算 ═══════════ */
  if (phase === "end") {
    const goodWin = winner === "good";
    const title = goodWin ? "亚瑟的忠臣获胜" : "邪恶阵营获胜";
    const why = {
      good: `${killed?.name} 不是梅林，刺客扑空。`,
      "evil-assassin": `刺客指认了 ${killed?.name}——正是梅林。`,
      "evil-mission": "三次任务失败。",
      "evil-vote": "连续五次组队被否决。",
    }[winner];
    return (
      <Shell {...shellProps} eyebrow="终局" title={title}
        footer={<div className="flex gap-2">
          <Btn tone="ghost" small onClick={resetAll}>换一局</Btn>
          <div className="flex-1"><Btn full onClick={() => { setPhase("roles"); }}>同一批人再来</Btn></div>
        </div>}>
        <div style={{ ...serif, fontSize: 19, color: goodWin ? C.azure : C.crimson, lineHeight: 1.7 }}>{why}</div>
        <Rule label="全员亮牌" />
        <div className="flex flex-col gap-2">
          {players.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl p-2" style={{ background: C.panel, border: `1px solid ${sideColor(p.role)}33` }}>
              <Avatar p={p} size={46} ring={sideColor(p.role)} />
              <div className="flex-1">
                <div style={{ fontSize: 15 }}>{p.name}</div>
                <div style={{ ...serif, fontSize: 13, color: sideColor(p.role) }}>{ROLES[p.role].n}</div>
              </div>
              {p.id === killed?.id && <span style={{ fontSize: 12, color: C.crimson }}>被刺杀</span>}
            </div>
          ))}
        </div>
        <Rule label="任务回顾" />
        <div className="flex flex-col gap-2">
          {history.map((h, i) => (
            <div key={i} className="flex items-center gap-3" style={{ fontSize: 14 }}>
              <span style={{ ...mono, color: C.dim }}>第{i + 1}轮</span>
              <span style={{ color: h.ok ? C.azure : C.crimson }}>{h.ok ? "成功" : `失败 · ${h.fails} 张失败牌`}</span>
              <span style={{ color: C.dim, fontSize: 12 }}>队长 {players[h.leader]?.name}</span>
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  return null;
}
