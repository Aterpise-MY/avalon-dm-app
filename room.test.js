import { describe, expect, it } from "vitest";
import { ROOM_TTL_MS, ROOM_VERSION, Room } from "./room.js";

const NOW = Date.parse("2026-09-07T14:00:00.000Z");
const STARTED = new Date(NOW - 60 * 60 * 1000).toISOString();

const mkPlayers = (n) => Array.from({ length: n }, (_, i) => ({
  id: `p${i}`,
  name: `玩家${i}`,
  photoPath: `uid/players/p${i}.jpg`,
  photo: "https://example.test/signed-url-that-expires",
  role: i === 0 ? "merlin" : "servant",
  uploading: false,
  photoError: "",
}));

const baseState = (over = {}) => ({
  phase: "game",
  count: 7,
  players: mkPlayers(7),
  opts: { percival: true, morgana: true, mordred: false, oberon: false },
  dealMode: "auto",
  passIdx: 0,
  nightStep: 0,
  round: 2,
  step: "team",
  leader: 3,
  selectedTeamSize: 3,
  team: ["p1", "p4"],
  votes: { p0: true, p1: false },
  rejects: 1,
  history: [{ fails: 0, ok: true, team: ["p0", "p1"], leader: 5 }],
  missionResult: null,
  winner: null,
  killed: null,
  gameId: "417",
  startedAt: STARTED,
  ...over,
});

const roundTrip = (over = {}, now = NOW) => Room.unpack(Room.pack(baseState(over), now), now);

/* 递归找出对象里出现过的所有 key，用来验证秘密字段确实没被写出去 */
const allKeys = (value, found = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, found));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      found.add(k);
      allKeys(v, found);
    }
  }
  return found;
};

describe("Room.pack", () => {
  it("只在可恢复阶段产出快照", () => {
    for (const phase of ["pass", "night", "game", "assassin"]) {
      expect(Room.pack(baseState({ phase, step: "leader" }), NOW)).not.toBeNull();
    }
    for (const phase of ["setup", "roles", "end"]) {
      expect(Room.pack(baseState({ phase }), NOW)).toBeNull();
    }
  });

  it("已经分出胜负的局不再存档", () => {
    expect(Room.pack(baseState({ winner: "good" }), NOW)).toBeNull();
  });

  it("人数与名单对不上时不存档", () => {
    expect(Room.pack(baseState({ players: mkPlayers(6) }), NOW)).toBeNull();
  });

  it("不把秘密或临时字段写进存档", () => {
    const keys = allKeys(Room.pack(baseState(), NOW));
    for (const forbidden of ["photo", "sealBroken", "peek", "dbStatus", "uploading",
      "photoError", "saved", "startingGame", "clearingPlayers", "playerMessage"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
    expect(keys.has("photoPath")).toBe(true);
    expect(keys.has("role")).toBe(true);
  });

  it("队长与历史队长都以 id 落盘，而不是下标", () => {
    const packed = Room.pack(baseState(), NOW);

    expect(packed.leaderId).toBe("p3");
    expect(packed.history[0].leaderId).toBe("p5");
    expect(packed.leader).toBeUndefined();
  });
});

describe("Room.unpack", () => {
  it("往返之后现场完全一致", () => {
    const restored = roundTrip();

    expect(restored.phase).toBe("game");
    expect(restored.count).toBe(7);
    expect(restored.round).toBe(2);
    expect(restored.step).toBe("team");
    expect(restored.leader).toBe(3);
    expect(restored.history[0].leader).toBe(5);
    expect(restored.team).toEqual(["p1", "p4"]);
    expect(restored.votes).toEqual({ p0: true, p1: false });
    expect(restored.rejects).toBe(1);
    expect(restored.gameId).toBe("417");
    expect(restored.players.map((p) => p.id)).toEqual(["p0", "p1", "p2", "p3", "p4", "p5", "p6"]);
    expect(restored.players[0].role).toBe("merlin");
  });

  it("火漆永远重新封上", () => {
    expect(roundTrip({ phase: "pass", passIdx: 3 }).sealBroken).toBe(false);
  });

  it("头像只保留 photoPath，签名 URL 一律丢弃", () => {
    const restored = roundTrip();

    expect(restored.players[0].photoPath).toBe("uid/players/p0.jpg");
    expect(restored.players[0].photo).toBeNull();
  });

  it("找不到的队长收敛成 null 而不是 -1", () => {
    const packed = Room.pack(baseState(), NOW);
    packed.leaderId = "不存在的人";
    packed.history[0].leaderId = "也不存在";
    const restored = Room.unpack(packed, NOW);

    expect(restored.leader).toBeNull();
    expect(restored.leader).not.toBe(-1);
    expect(restored.history[0].leader).toBeNull();
  });

  it("版本对不上就当没有存档", () => {
    const packed = { ...Room.pack(baseState(), NOW), version: ROOM_VERSION + 1 };

    expect(Room.unpack(packed, NOW)).toBeNull();
  });

  it("超过 12 小时的房间不再提供", () => {
    /* 开局时间就是 NOW，这样 12 小时的边界才落在测的地方 */
    const packed = Room.pack(baseState({ startedAt: new Date(NOW).toISOString() }), NOW);

    expect(Room.unpack(packed, NOW + ROOM_TTL_MS - 60_000)).not.toBeNull();
    expect(Room.unpack(packed, NOW + ROOM_TTL_MS + 60_000)).toBeNull();
  });

  it("时效以开局时间为准，而不是最后保存时间", () => {
    const packed = Room.pack(baseState({ startedAt: new Date(NOW - 13 * 60 * 60 * 1000).toISOString() }), NOW);

    expect(Room.unpack(packed, NOW)).toBeNull();
  });

  it("人数与名单不一致的存档不予恢复", () => {
    const packed = Room.pack(baseState(), NOW);
    packed.players = packed.players.slice(0, 6);

    expect(Room.unpack(packed, NOW)).toBeNull();
  });

  it("game 阶段的 step 必须合法", () => {
    const packed = { ...Room.pack(baseState(), NOW), step: "乱写的" };

    expect(Room.unpack(packed, NOW)).toBeNull();
  });

  it("剔除已经不在名单里的投票与队员", () => {
    const packed = Room.pack(baseState(), NOW);
    packed.votes = { ...packed.votes, 幽灵: true };
    packed.team = [...packed.team, "幽灵"];
    const restored = Room.unpack(packed, NOW);

    expect(restored.votes).toEqual({ p0: true, p1: false });
    expect(restored.team).toEqual(["p1", "p4"]);
  });

  it("越界的数值被收进合法区间", () => {
    const packed = Room.pack(baseState(), NOW);
    Object.assign(packed, { passIdx: 99, nightStep: -3, rejects: 9, round: 12, selectedTeamSize: 0 });
    const restored = Room.unpack(packed, NOW);

    expect(restored.passIdx).toBe(6);
    expect(restored.nightStep).toBe(0);
    expect(restored.rejects).toBe(4);
    expect(restored.round).toBe(4);
    expect(restored.selectedTeamSize).toBe(1);
  });

  it.each([null, undefined, "", "{", "[]", "{}", 42, [], { version: ROOM_VERSION }])(
    "看不懂的输入一律返回 null 且不抛错：%p",
    (input) => {
      expect(Room.unpack(input, NOW)).toBeNull();
    },
  );

  it("接受 JSON 字符串，也接受已经解析好的对象", () => {
    const packed = Room.pack(baseState(), NOW);

    expect(Room.unpack(JSON.stringify(packed), NOW)?.round).toBe(2);
    expect(Room.unpack(packed, NOW)?.round).toBe(2);
  });
});

describe("Room.fingerprint / fresher / label", () => {
  it("指纹忽略保存时间，只看内容", () => {
    const a = Room.pack(baseState(), NOW);
    const b = Room.pack(baseState(), NOW + 5000);

    expect(a.savedAt).not.toBe(b.savedAt);
    expect(Room.fingerprint(a)).toBe(Room.fingerprint(b));
  });

  it("内容变了指纹就变", () => {
    const a = Room.pack(baseState(), NOW);
    const b = Room.pack(baseState({ rejects: 2 }), NOW);

    expect(Room.fingerprint(a)).not.toBe(Room.fingerprint(b));
  });

  it("取 savedAt 更新的一份", () => {
    const older = { savedAt: 1000 };
    const newer = { savedAt: 2000 };

    expect(Room.fresher(older, newer)).toBe(newer);
    expect(Room.fresher(newer, older)).toBe(newer);
    expect(Room.fresher(null, older)).toBe(older);
    expect(Room.fresher(older, null)).toBe(older);
    expect(Room.fresher(null, null)).toBeNull();
  });

  it("按钮文案说清楚回到哪一步", () => {
    expect(Room.label(roundTrip())).toBe("第 3 轮 · 选队友");
    expect(Room.label(roundTrip({ phase: "pass", passIdx: 2 }))).toBe("传阅身份 · 第 3 / 7 位");
    expect(Room.label(roundTrip({ phase: "night", nightStep: 3 }))).toBe("夜晚脚本 · 第 4 步");
    expect(Room.label(roundTrip({ phase: "assassin" }))).toBe("刺客出手");
  });
});
