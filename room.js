import { useCallback, useEffect, useState } from "react";
import { apiRequest, signPlayerPhotos } from "./supabase-client.js";

/*
 * 房间 Room —— 这一局的可恢复现场。
 *
 * DM 误刷新、切后台被系统回收、或者换一台设备登录同一个 Google 账号，
 * 都可以「回到房间」接着打。云端（games.state）是主存档，
 * localStorage 是云端离线时的回退。
 *
 * 这里的函数除 useRoom 外全是纯函数，方便在 environment: "node" 下直接测。
 */

export const ROOM_VERSION = 1;
export const ROOM_KEY = "avalon:room";
export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

/* 只有这四个阶段值得恢复：入座与配角色重来一遍就好，终局已经没有悬念 */
const RESUMABLE_PHASES = new Set(["pass", "night", "game", "assassin"]);
const GAME_STEPS = new Set(["leader", "team", "vote", "mission", "missionResult"]);

/* 与 avalon-dm.jsx 保持一致；此处单独定义以免两个模块互相 import */
const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;

const STEP_LABEL = {
  leader: "选队长",
  team: "选队友",
  vote: "判定组队",
  mission: "任务结算",
  missionResult: "本轮结果",
};

const clamp = (value, lo, hi, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), lo), hi);
};

const isPlainObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/* 只留下能安全落盘的字段：photo 是 24 小时就过期的签名 URL，存了等于存了个死链 */
const packPlayers = (players) => players.map((p) => ({
  id: p.id,
  name: p.name,
  photoPath: p.photoPath || null,
  role: p.role || null,
}));

export const Room = {
  /* 内存状态 → 可落盘的房间快照。不在可恢复阶段时返回 null，调用方据此清档。 */
  pack(state, now = Date.now()) {
    if (!isPlainObject(state)) return null;
    if (!RESUMABLE_PHASES.has(state.phase)) return null;
    if (state.winner) return null;

    const players = Array.isArray(state.players) ? state.players : [];
    if (players.length !== state.count) return null;
    if (players.some((p) => !p || typeof p.id !== "string")) return null;

    const leaderId = players[state.leader]?.id ?? null;
    const iso = new Date(now).toISOString();

    return {
      version: ROOM_VERSION,
      savedAt: iso,
      startedAt: state.startedAt || iso,
      gameId: state.gameId ? String(state.gameId) : null,

      phase: state.phase,
      count: state.count,
      dealMode: state.dealMode,
      opts: { ...state.opts },
      players: packPlayers(players),

      passIdx: state.passIdx ?? 0,
      nightStep: state.nightStep ?? 0,

      round: state.round ?? 0,
      step: state.step ?? "leader",
      selectedTeamSize: state.selectedTeamSize ?? 0,
      team: [...(state.team || [])],
      votes: { ...(state.votes || {}) },
      rejects: state.rejects ?? 0,
      leaderId,
      history: (state.history || []).map((h) => ({
        fails: h.fails,
        ok: h.ok,
        team: [...(h.team || [])],
        leaderId: players[h.leader]?.id ?? null,
      })),
      missionResult: state.missionResult ? { ...state.missionResult } : null,

      /* 恢复用不到，留字段是为了将来加载旧档时能一眼看出是不是残局 */
      winner: null,
      killedId: state.killed?.id ?? null,
    };
  },

  /*
   * 房间快照 → 可以直接灌进 setState 的内存状态。
   * 任何看不懂的输入一律返回 null，绝不抛错——损坏的存档和没有存档对 DM 来说是同一件事。
   */
  unpack(raw, now = Date.now()) {
    let room = raw;
    if (typeof room === "string") {
      try {
        room = JSON.parse(room);
      } catch (e) {
        return null;
      }
    }
    if (!isPlainObject(room)) return null;
    if (room.version !== ROOM_VERSION) return null;

    const savedAt = Date.parse(room.savedAt);
    const startedAt = Date.parse(room.startedAt);
    if (!Number.isFinite(savedAt) || !Number.isFinite(startedAt)) return null;
    if (now - startedAt > ROOM_TTL_MS) return null;

    if (!RESUMABLE_PHASES.has(room.phase)) return null;
    if (room.winner) return null;
    if (room.phase === "game" && !GAME_STEPS.has(room.step)) return null;
    if (room.dealMode !== "auto" && room.dealMode !== "manual") return null;

    const count = Number(room.count);
    if (!Number.isInteger(count) || count < MIN_PLAYERS || count > MAX_PLAYERS) return null;
    if (!Array.isArray(room.players) || room.players.length !== count) return null;
    if (room.players.some((p) => !isPlainObject(p) || typeof p.id !== "string" || typeof p.name !== "string")) {
      return null;
    }

    const players = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      photoPath: p.photoPath || null,
      photo: null, /* 稍后由 signPlayerPhotos 重新签发 */
      role: p.role || null,
      uploading: false,
      photoError: "",
    }));

    const indexOfId = new Map(players.map((p, i) => [p.id, i]));
    const known = (id) => indexOfId.has(id);
    /* -1 会让 players[leader] 变成 undefined 且不报错，所以一律收敛成 null */
    const seatOf = (id) => (indexOfId.has(id) ? indexOfId.get(id) : null);

    const votes = {};
    if (isPlainObject(room.votes)) {
      for (const [id, v] of Object.entries(room.votes)) {
        if (known(id)) votes[id] = Boolean(v);
      }
    }

    return {
      savedAt,
      startedAt: room.startedAt,
      gameId: room.gameId ? String(room.gameId) : null,

      phase: room.phase,
      count,
      dealMode: room.dealMode,
      opts: {
        percival: Boolean(room.opts?.percival),
        morgana: Boolean(room.opts?.morgana),
        mordred: Boolean(room.opts?.mordred),
        oberon: Boolean(room.opts?.oberon),
      },
      players,

      passIdx: clamp(room.passIdx, 0, count - 1, 0),
      /* 火漆永远重新封上：恢复成已拆封会把身份直接亮给手里拿着手机的人 */
      sealBroken: false,
      nightStep: Math.max(0, clamp(room.nightStep, 0, Number.MAX_SAFE_INTEGER, 0)),

      round: clamp(room.round, 0, 4, 0),
      step: GAME_STEPS.has(room.step) ? room.step : "leader",
      leader: seatOf(room.leaderId),
      selectedTeamSize: clamp(room.selectedTeamSize, 1, count, 1),
      team: (Array.isArray(room.team) ? room.team : []).filter(known),
      votes,
      rejects: clamp(room.rejects, 0, 4, 0),
      history: (Array.isArray(room.history) ? room.history : []).map((h) => ({
        fails: clamp(h?.fails, 0, count, 0),
        ok: Boolean(h?.ok),
        team: (Array.isArray(h?.team) ? h.team : []).filter(known),
        leader: seatOf(h?.leaderId),
      })),
      missionResult: isPlainObject(room.missionResult)
        ? { fails: clamp(room.missionResult.fails, 0, count, 0), ok: Boolean(room.missionResult.ok) }
        : null,

      winner: null,
      killed: players.find((p) => p.id === room.killedId) || null,
    };
  },

  /* 去掉 savedAt 的指纹：用来判断「内容真的变了吗」，避免每次渲染都写一遍 */
  fingerprint(room) {
    if (!room) return "";
    const { savedAt, ...rest } = room;
    return JSON.stringify(rest);
  },

  /* savedAt 更晚的那份胜出；两份都在时说明本地曾离线操作过或换过设备 */
  fresher(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return b.savedAt > a.savedAt ? b : a;
  },

  label(room) {
    if (!room) return "";
    if (room.phase === "pass") return `传阅身份 · 第 ${(room.passIdx ?? 0) + 1} / ${room.count} 位`;
    if (room.phase === "night") return `夜晚脚本 · 第 ${(room.nightStep ?? 0) + 1} 步`;
    if (room.phase === "assassin") return "刺客出手";
    return `第 ${(room.round ?? 0) + 1} 轮 · ${STEP_LABEL[room.step] || "进行中"}`;
  },

  read() {
    try {
      return window.localStorage.getItem(ROOM_KEY);
    } catch (e) {
      return null; /* 隐私模式或存储被禁用 */
    }
  },

  write(json) {
    try {
      window.localStorage.setItem(ROOM_KEY, json);
    } catch (e) {
      /* 配额满了也不该打断现场，云端还在 */
    }
  },

  clear() {
    try {
      window.localStorage.removeItem(ROOM_KEY);
    } catch (e) {
      /* 同上 */
    }
  },
};

/*
 * 开局时找一次房间：先读本地，再问云端，取较新的一份，最后把头像重新签名。
 * 只负责「有没有房间可回」，不负责恢复本身——恢复要动二十个 setState，
 * 那些 setter 住在 AvalonDM 里。
 */
export function useRoom() {
  const [state, setState] = useState({ status: "checking", candidate: null, source: null });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const now = Date.now();
      const rawLocal = Room.read();
      let local = Room.unpack(rawLocal, now);
      if (rawLocal && !local) Room.clear(); /* 过期或损坏，别留着 */

      let cloud = null;
      let cloudReachable = false;
      try {
        const data = await apiRequest("/games/active");
        cloudReachable = true;
        if (data?.game?.state) {
          const parsed = Room.unpack(data.game.state, now);
          if (parsed) cloud = { ...parsed, gameId: String(data.game.id) };
        }
      } catch (e) {
        /* 云端离线：本地存档照用，且绝不因为这次失败就把它删了 */
      }

      if (cancelled) return;

      /* 云端明确说「没有这一局」才作数——它可能已在另一台设备上结束了 */
      if (cloudReachable && local?.gameId && local.gameId !== cloud?.gameId) {
        Room.clear();
        local = null;
      }

      const pick = Room.fresher(cloud, local);
      if (!pick) {
        setState({ status: "none", candidate: null, source: null });
        return;
      }

      let players = pick.players;
      try {
        players = await signPlayerPhotos(pick.players);
      } catch (e) {
        /* 签不出来就回退成名字首字，Avatar 本来就这么处理 */
      }
      if (cancelled) return;

      setState({
        status: "found",
        candidate: {
          ...pick,
          players: players.map((p) => ({ ...p, uploading: false, photoError: "" })),
        },
        source: pick === cloud ? "cloud" : "local",
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    setState({ status: "none", candidate: null, source: null });
  }, []);

  return { ...state, dismiss };
}
