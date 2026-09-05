import { describe, expect, it } from "vitest";
import { evilRecognitionPlayers, knownTo, merlinVisiblePlayers } from "./avalon-dm.jsx";

const players = [
  { id: "merlin", role: "merlin" },
  { id: "assassin", role: "assassin" },
  { id: "morgana", role: "morgana" },
  { id: "mordred", role: "mordred" },
  { id: "oberon", role: "oberon" },
  { id: "minion", role: "minion" },
  { id: "servant", role: "servant" },
];

describe("night information", () => {
  it("shows Merlin only the Assassin and Morgana", () => {
    const information = knownTo(players[0], players);

    expect(information.list.map((player) => player.id)).toEqual(["assassin", "morgana"]);
  });

  it("uses the same visibility rule during the night ceremony", () => {
    expect(merlinVisiblePlayers(players).map((player) => player.id)).toEqual(["assassin", "morgana"]);
  });

  it("lets only the Assassin and Morgana recognize each other", () => {
    expect(evilRecognitionPlayers(players).map((player) => player.id)).toEqual(["assassin", "morgana"]);
    expect(knownTo(players[1], players).list.map((player) => player.id)).toEqual(["morgana"]);
    expect(knownTo(players[2], players).list.map((player) => player.id)).toEqual(["assassin"]);
  });

  it.each(["mordred", "oberon", "minion", "servant"])("shows %s nobody", (role) => {
    const information = knownTo(players.find((player) => player.role === role), players);

    expect(information.list).toEqual([]);
  });
});
