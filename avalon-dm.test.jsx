import { describe, expect, it } from "vitest";
import { knownTo, merlinVisiblePlayers } from "./avalon-dm.jsx";

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

  it("shows Oberon nobody", () => {
    const information = knownTo(players[4], players);

    expect(information.list).toEqual([]);
  });

  it("hides Oberon from the other evil players", () => {
    const information = knownTo(players[1], players);

    expect(information.list.map((player) => player.id)).toEqual(["morgana", "mordred", "minion"]);
  });
});
