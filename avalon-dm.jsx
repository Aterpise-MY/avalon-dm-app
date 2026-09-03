import React, { useState, useEffect, useRef } from "react";

/* ── 圆桌调色板 ───────────────────────────────── */
const C = {
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
const serif = { fontFamily: "Georgia, 'Times New Roman', serif" };
const mono = { fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace" };

/* 单手持握的一列，最宽 480 —— 桌面上居中，不铺满整屏 */
const SHELL_W = 480;

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
  merlin: { n: "梅林", side: "good", d: "知晓所有坏人（莫德雷德除外）。别被刺客认出来。" },
  percival: { n: "派西维尔", side: "good", d: "知晓梅林与莫甘娜两人，但分不清谁是谁。" },
  servant: { n: "忠臣", side: "good", d: "亚瑟的忠臣。没有特殊情报，靠推理。" },
  assassin: { n: "刺客", side: "evil", d: "好人拿到三次成功后，由你指认梅林。" },
  morgana: { n: "莫甘娜", side: "evil", d: "在派西维尔眼中，你和梅林长得一样。" },
  mordred: { n: "莫德雷德", side: "evil", d: "梅林看不见你。" },
  oberon: { n: "奥伯伦", side: "evil", d: "你不认识其他坏人，他们也不认识你。" },
  minion: { n: "爪牙", side: "evil", d: "莫德雷德的爪牙。" },
};
const sideColor = (k) => (ROLES[k]?.side === "evil" ? C.crimson : C.azure);
const isEvil = (p) => ROLES[p?.role]?.side === "evil";
const isGood = (p) => ROLES[p?.role]?.side === "good";

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
function knownTo(player, players) {
  const others = players.filter((p) => p.id !== player.id);
  const evils = others.filter(isEvil);
  switch (player.role) {
    case "merlin": return { label: "以下是邪恶阵营", list: evils.filter((p) => p.role !== "mordred") };
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

/* ── 主程序 ───────────────────────────────────── */
export default function AvalonDM() {
  const [phase, setPhase] = useState("setup");
  const [count, setCount] = useState(7);
  const [players, setPlayers] = useState([]);
  const [opts, setOpts] = useState({ percival: true, morgana: true, mordred: false, oberon: false });
  const [dealMode, setDealMode] = useState("auto");
  const [saved, setSaved] = useState(null);

  const [passIdx, setPassIdx] = useState(0);
  const [sealBroken, setSealBroken] = useState(false);
  const [manualPick, setManualPick] = useState(null);
  const [nightStep, setNightStep] = useState(0);
  const [peek, setPeek] = useState(false);

  const [round, setRound] = useState(0);
  const [step, setStep] = useState("team");
  const [leader, setLeader] = useState(0);
  const [team, setTeam] = useState([]);
  const [votes, setVotes] = useState({});
  const [rejects, setRejects] = useState(0);
  const [history, setHistory] = useState([]);
  const [winner, setWinner] = useState(null);
  const [killed, setKilled] = useState(null);

  const fileRef = useRef(null);
  const pendingRef = useRef(null);

  /* 上次的玩家名单 */
  useEffect(() => {
    (async () => {
      try {
        if (!window.storage) return;
        const r = await window.storage.get("avalon:roster");
        const d = r ? JSON.parse(r.value) : null;
        if (d?.players?.length) setSaved(d.players);
      } catch (e) { /* 没有存档 */ }
    })();
  }, []);

  useEffect(() => {
    setPlayers((prev) => {
      const next = [];
      for (let i = 0; i < count; i++) next.push(prev[i] || { id: "p" + i + "_" + Math.random().toString(36).slice(2, 6), name: "", photo: null, role: null });
      return next;
    });
  }, [count]);

  const setP = (i, patch) => setPlayers((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  const openCamera = (i) => { pendingRef.current = i; fileRef.current?.click(); };
  const onFile = (e) => {
    const f = e.target.files?.[0]; const i = pendingRef.current;
    e.target.value = "";
    if (!f || i == null) return;
    const img = new Image(); const url = URL.createObjectURL(f);
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const cv = document.createElement("canvas"); cv.width = cv.height = 260;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 260, 260);
      setP(i, { photo: cv.toDataURL("image/jpeg", 0.72) });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const saveRoster = async (list) => {
    try { if (window.storage) await window.storage.set("avalon:roster", JSON.stringify({ players: list.map(({ id, name, photo }) => ({ id, name, photo })) })); } catch (e) { /* 存不下就算了 */ }
  };

  const composition = buildRoles(count, opts);
  const evilSlots = SPLIT[count].evil;
  const wantedEvil = 1 + (opts.morgana ? 1 : 0) + (opts.mordred ? 1 : 0) + (opts.oberon ? 1 : 0);
  const overflow = wantedEvil > evilSlots;

  const startDeal = () => {
    saveRoster(players);
    setNightStep(0);
    if (dealMode === "auto") {
      const rs = shuffle(composition);
      setPlayers((ps) => ps.map((p, i) => ({ ...p, role: rs[i] })));
      setPassIdx(0); setSealBroken(false); setPhase("pass");
    } else {
      setPlayers((ps) => ps.map((p) => ({ ...p, role: null })));
      setPhase("manual");
    }
  };

  const startGame = () => {
    setRound(0); setStep("team"); setLeader(Math.floor(Math.random() * count));
    setTeam([]); setVotes({}); setRejects(0); setHistory([]); setWinner(null); setKilled(null);
    setPhase("game");
  };

  const resetAll = () => {
    setPlayers((ps) => ps.map((p) => ({ ...p, role: null })));
    setPhase("setup");
  };

  /* ── 任务流程 ── */
  const teamSize = TEAM[count][round];
  const need = failsNeeded(count, round);
  const yes = Object.values(votes).filter(Boolean).length;
  const no = Object.keys(votes).length - yes;

  const confirmVote = () => {
    if (yes > no) { setStep("mission"); return; }
    const r = rejects + 1;
    if (r >= 5) { setWinner("evil-vote"); setPhase("end"); return; }
    setRejects(r); setLeader((leader + 1) % count); setTeam([]); setVotes({}); setStep("team");
  };

  const submitMission = (fails) => {
    const ok = fails < need;
    const h = [...history, { fails, ok, team, leader }];
    setHistory(h);
    const wins = h.filter((x) => x.ok).length, loses = h.length - wins;
    setRejects(0); setTeam([]); setVotes({}); setLeader((leader + 1) % count);
    if (loses >= 3) { setWinner("evil-mission"); setPhase("end"); return; }
    if (wins >= 3) { setPhase("assassin"); return; }
    setRound(round + 1); setStep("team");
  };

  const doAssassinate = (p) => {
    setKilled(p);
    setWinner(p.role === "merlin" ? "evil-assassin" : "good");
    setPhase("end");
  };

  /* ── 夜晚脚本 ── */
  const buildNight = () => {
    const inPlay = (k) => players.some((p) => p.role === k);
    const by = (f) => players.filter(f);
    const s = [{ t: "闭眼", x: "所有人闭上眼睛，握拳，伸出大拇指。", who: [] }];
    s.push({
      t: "坏人相认",
      x: `邪恶阵营睁眼，互相确认${inPlay("oberon") ? "（奥伯伦不睁眼，也不被看到）" : ""}。确认完毕后闭眼、握拳。`,
      who: by((p) => isEvil(p) && p.role !== "oberon"),
    });
    s.push({
      t: "梅林确认坏人",
      x: `所有坏人${inPlay("mordred") ? "（莫德雷德除外）" : ""}伸出大拇指。梅林睁眼，记下这些人。随后坏人收回拇指，梅林闭眼。`,
      who: by((p) => isEvil(p) && p.role !== "mordred"),
    });
    if (inPlay("percival"))
      s.push({
        t: "派西维尔确认",
        x: "梅林与莫甘娜伸出大拇指。派西维尔睁眼，记下这两人——他分不清谁是梅林。随后二人收回拇指，派西维尔闭眼。",
        who: by((p) => p.role === "merlin" || p.role === "morgana"),
      });
    s.push({ t: "天亮", x: "所有人睁眼。任务开始。", who: [] });
    return s;
  };

  /* ── 外壳 ── */
  const Shell = ({ eyebrow, title, children, footer, center }) => (
    <div style={{ background: C.ink, color: C.text, minHeight: "100dvh" }} className="flex justify-center">
      <div className="shell-col flex flex-col w-full" style={{ maxWidth: SHELL_W, minHeight: "100dvh" }}>
      <div className="px-5 pb-3" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "max(24px, env(safe-area-inset-top))" }}>
        <div style={{ ...serif, color: C.goldDim, fontSize: 11, letterSpacing: "0.34em" }}>{eyebrow}</div>
        <div className="flex items-end justify-between mt-1">
          <h1 style={{ ...serif, fontSize: 26, color: C.text, letterSpacing: "0.04em" }}>{title}</h1>
          {players.some((p) => p.role) && phase !== "pass" && (
            <button
              onPointerDown={() => setPeek(true)} onPointerUp={() => setPeek(false)}
              onPointerLeave={() => setPeek(false)}
              className="rounded-xl" style={{ border: `1px solid ${C.line}`, color: C.dim, padding: "7px 12px", fontSize: 12 }}
            >按住看底牌</button>
          )}
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

  /* ═══════════ 玩家录入 ═══════════ */
  if (phase === "setup") {
    const ready = players.length === count && players.every((p) => p.name.trim());
    return (
      <Shell eyebrow="AVALON · 主持人" title="入座"
        footer={
          <div>
            <Btn full disabled={!ready} onClick={() => { saveRoster(players); setPhase("roles"); }}>
              {ready ? "名单齐了，配角色" : "还有人没填名字"}
            </Btn>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 8, textAlign: "center" }}>头像可以先跳过，之后随时补拍</div>
          </div>
        }>
        <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={onFile} style={{ display: "none" }} />
        <div style={{ ...serif, color: C.dim, fontSize: 14, lineHeight: 1.7 }}>
          把手机依次传给每个人，让他们拍下自己、写上名字。之后这一晚，你都靠这些头像认人。
        </div>
        {saved && (
          <button onClick={() => { setCount(saved.length); setPlayers(saved.map((s) => ({ ...s, role: null }))); setSaved(null); }}
            className="w-full rounded-xl mt-4 active:scale-95 transition"
            style={{ border: `1px dashed ${C.goldDim}`, color: C.gold, padding: "12px", fontSize: 14 }}>
            载入上次的 {saved.length} 位玩家
          </button>
        )}
        <Rule label="人数" />
        <div className="grid grid-cols-6 gap-2">
          {[5, 6, 7, 8, 9, 10].map((n) => (
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
              <button onClick={() => openCamera(i)} className="active:scale-95 transition">
                <Avatar p={p} size={56} ring={p.photo ? C.gold : C.line} />
              </button>
              <input
                value={p.name} onChange={(e) => setP(i, { name: e.target.value })}
                placeholder={`${i + 1} 号位`}
                className="flex-1 rounded-xl"
                style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.text, padding: "13px 14px", fontSize: 16, outline: "none", transition: "border-color .18s" }}
                onFocus={(e) => (e.target.style.borderColor = C.gold)}
                onBlur={(e) => (e.target.style.borderColor = C.line)}
              />
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
      <Shell eyebrow="AVALON · 主持人" title="配置角色"
        footer={
          <div className="flex flex-col gap-2">
            {overflow && <div style={{ color: C.crimson, fontSize: 13 }}>坏人位只有 {evilSlots} 个，多选的特殊角色会被忽略。</div>}
            <Btn full onClick={startDeal}>{dealMode === "auto" ? "开始发牌" : "开始录入身份"}</Btn>
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
          {[["auto", "App 发牌", "手机传一圈，各自拆封"], ["manual", "实体牌", "抽完牌，你来录入"]].map(([k, t, s]) => (
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
      <Shell eyebrow={`第 ${passIdx + 1} / ${players.length} 位`} title={sealBroken ? "你的身份" : "请传给"} center>
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

  /* ═══════════ 手动录入身份 ═══════════ */
  if (phase === "manual") {
    const used = players.map((p) => p.role).filter(Boolean);
    const remain = (k) => composition.filter((x) => x === k).length - used.filter((x) => x === k).length;
    const done = players.every((p) => p.role);
    return (
      <Shell eyebrow="实体牌" title="录入身份"
        footer={<Btn full disabled={!done} onClick={() => setPhase("night")}>身份录完，进入夜晚</Btn>}>
        <div style={{ color: C.dim, fontSize: 14, lineHeight: 1.7 }}>
          发完实体牌后，让每人告诉你——或者你自己看牌——点头像登记。
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5">
          {players.map((p, i) => (
            <button key={p.id} onClick={() => setManualPick(i)} className="flex flex-col items-center active:scale-95 transition">
              <Avatar p={p} size={72} ring={p.role ? sideColor(p.role) : C.line} />
              <div style={{ fontSize: 13, marginTop: 6 }}>{p.name}</div>
              <div style={{ ...serif, fontSize: 12, color: p.role ? sideColor(p.role) : C.dim }}>{p.role ? ROLES[p.role].n : "点击登记"}</div>
            </button>
          ))}
        </div>
        {manualPick !== null && (
          <div className="fixed inset-0 flex items-end" style={{ background: "rgba(6,6,14,.8)", zIndex: 60 }} onClick={() => setManualPick(null)}>
            <div className="w-full rounded-2xl p-5" style={{ background: C.ink2, borderTop: `1px solid ${C.line}` }} onClick={(e) => e.stopPropagation()}>
              <div style={{ ...serif, fontSize: 20 }}>{players[manualPick].name} 是</div>
              <div className="flex flex-col gap-2 mt-4">
                {[...new Set(composition)].map((k) => {
                  const left = remain(k) + (players[manualPick].role === k ? 1 : 0);
                  return (
                    <button key={k} disabled={left <= 0}
                      onClick={() => { setP(manualPick, { role: k }); setManualPick(null); }}
                      className="rounded-xl flex items-center justify-between active:scale-95 transition"
                      style={{ background: C.panel, border: `1px solid ${C.line}`, padding: "14px", opacity: left <= 0 ? 0.35 : 1 }}>
                      <span style={{ ...serif, fontSize: 16, color: sideColor(k) }}>{ROLES[k].n}</span>
                      <span style={{ ...mono, fontSize: 12, color: C.dim }}>剩 {left}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Shell>
    );
  }

  /* ═══════════ 夜晚仪式 ═══════════ */
  if (phase === "night") {
    const nightSteps = buildNight();
    const s = nightSteps[Math.min(nightStep, nightSteps.length - 1)];
    const last = nightStep >= nightSteps.length - 1;
    return (
      <Shell eyebrow={`夜晚 · ${nightStep + 1} / ${nightSteps.length}`} title={s.t} center
        footer={
          <div className="flex gap-2">
            {nightStep > 0 && <Btn tone="ghost" small onClick={() => setNightStep(nightStep - 1)}>上一步</Btn>}
            <div className="flex-1">
              <Btn full onClick={() => (last ? startGame() : setNightStep(nightStep + 1))}>{last ? "开始第一轮任务" : "下一步"}</Btn>
            </div>
          </div>
        }>
        <div style={{ ...serif, fontSize: 20, lineHeight: 1.85 }}>{s.x}</div>
        {s.who.length > 0 && (
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
          <button onClick={startGame} className="w-full rounded-xl mt-6"
            style={{ border: `1px dashed ${C.line}`, color: C.dim, padding: 12, fontSize: 13 }}>
            大家已在手机上看过情报，跳过夜晚
          </button>
        )}
      </Shell>
    );
  }

  /* ═══════════ 任务流程 ═══════════ */
  if (phase === "game") {
    const ld = players[leader];
    return (
      <Shell eyebrow={`第 ${round + 1} 轮任务 · 需 ${teamSize} 人${need === 2 ? " · 需 2 张失败牌" : ""}`}
        title={step === "team" ? "组队" : step === "vote" ? "投票" : "任务结果"}
        footer={
          step === "team" ? (
            <Btn full disabled={team.length !== teamSize} onClick={() => { setVotes({}); setStep("vote"); }}>
              {team.length}/{teamSize} 人 · 开始投票
            </Btn>
          ) : step === "vote" ? (
            <Btn full disabled={Object.keys(votes).length !== count} onClick={confirmVote}>
              {Object.keys(votes).length === count ? (yes > no ? `${yes} 比 ${no} 通过` : `${yes} 比 ${no} 否决`) : `还有 ${count - Object.keys(votes).length} 人没投`}
            </Btn>
          ) : null
        }>
        {/* 战绩 */}
        <div className="flex items-center gap-2">
          {TEAM[count].map((sz, i) => {
            const h = history[i];
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
            <div key={i} className="rounded-full" style={{ width: 9, height: 9, background: i < rejects ? C.crimson : C.line }} />
          ))}
        </div>

        <Rule label="队长" />
        <div className="flex items-center gap-3">
          <Avatar p={ld} size={52} ring={C.gold} />
          <div>
            <div style={{ ...serif, fontSize: 19 }}>{ld.name}</div>
            <div style={{ fontSize: 13, color: C.dim }}>由他挑选 {teamSize} 人出任务</div>
          </div>
        </div>

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
                  } else if (step === "vote") {
                    setVotes((vv) => ({ ...vv, [p.id]: !(p.id in vv) ? true : vv[p.id] === true ? false : undefined }));
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

        {step === "mission" && (
          <>
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
      </Shell>
    );
  }

  /* ═══════════ 刺杀 ═══════════ */
  if (phase === "assassin") {
    const ass = players.find((p) => p.role === "assassin");
    return (
      <Shell eyebrow="好人已完成三次任务" title="刺客出手">
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
      <Shell eyebrow="终局" title={title}
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
