import { describe, expect, it } from "vitest";
import { chaseName } from "../court/chase.ts";
import { standardCourt as court } from "../court/standard.ts";
import { playRest, startMatch } from "../rules/match.ts";
import { callScore } from "../rules/score.ts";
import { teach } from "../rules/teaching.ts";
import { restResult } from "./result.ts";

const H = "human";
const AI = "ai";
const labels = { [H]: "Player", [AI]: "Opponent" };
const start = startMatch(court, { players: [H, AI], sets: 1, suddenDeath: false }, H);
const two = chaseName(court, { side: "service", distance: 1.6 });

describe("restResult", () => {
  it("names the winner by role and gives the score after the rest", () => {
    const r = restResult(start, { kind: "point", winner: AI, reason: "dedans" }, [], labels);
    expect(r).toMatchObject({ winner: AI, title: "Point to Opponent", note: null });
    expect(r.why).toBe("Dedans! The striker wins the rest");
    expect(callScore(r.match, labels)).toBe("Fifteen–love");
  });

  it("uses the Marker's call for why, with its detail", () => {
    const calls = [teach("chaseLaid", "better than two")];
    const r = restResult(start, { kind: "chase", call: two, reason: "chaseLaid" }, calls, labels);
    expect(r).toMatchObject({
      winner: null,
      title: "Chase laid",
      why: "Chase laid: better than two",
    });
    expect(r.note).toMatch(/^No point yet/);
    expect(r.match.chases).toEqual([two]);
  });

  it("scores nothing for a first fault, and the point for a double fault (Law 11.2(b))", () => {
    const fault = { kind: "fault", reason: "faultDrop" } as const;
    const first = restResult(start, fault, [], labels);
    expect(first).toMatchObject({ winner: null, title: "Fault" });
    expect(first.note).toMatch(/one fault stands/);
    const second = restResult(first.match, fault, [], labels);
    expect(second).toMatchObject({ winner: AI, title: "Double fault: point to Opponent" });
    expect(second.why).toBe("Two faults in a row: the server loses the rest");
    expect(second.match.points[AI]).toBe(1);
  });

  it("scores nothing for a let or a chase off", () => {
    const m = playRest(start, { kind: "chase", call: two, reason: "chaseLaid" }).state;
    expect(restResult(m, { kind: "let", reason: "letHindrance" }, [], labels)).toMatchObject({
      winner: null,
      title: "Let",
    });
    expect(restResult(m, { kind: "chaseOff", call: two }, [], labels)).toMatchObject({
      winner: null,
      title: "Chase off",
    });
  });
});
