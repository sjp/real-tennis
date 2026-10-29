import { describe, expect, it } from "vitest";
import { chaseName } from "../court/chase.ts";
import { serviceLineZ } from "../court/classify.ts";
import { standardCourt as court } from "../court/standard.ts";
import type { OpeningId, Side } from "../court/types.ts";
import type { SimEvent } from "../sim/events.ts";
import { vec } from "../sim/vec.ts";
import { rally, startRally, type RallyInput, type RallySetup } from "./rally.ts";

const hw = court.floor.width / 2;
const hl = court.floor.length / 2;
const S = "server";
const R = "receiver";
const setup: RallySetup = { court, server: S, receiver: R, playingFor: null };

const at = (x: number, y: number, z: number) => ({ time: 0, position: vec(x, y, z) });
const hit = (player: string, z: number): SimEvent => ({
  ...at(0, 1, z),
  type: "racketHit",
  player,
  surface: "racket",
});
const bounce = (x: number, z: number): SimEvent => ({
  ...at(x, 0.03, z),
  type: "floorBounce",
  bounce: 1,
  surface: "floor",
});
const cross = (from: Side): SimEvent => ({
  ...at(0, 1, 0),
  type: "netCrossed",
  from,
  surface: "net",
});
const wall = (surface: SimEvent["surface"]): SimEvent => ({
  ...at(0, 1, 0),
  type: "wallHit",
  surface,
});
const roof = (surface: SimEvent["surface"], edge = false): SimEvent => ({
  ...at(hw, 3, 0),
  type: "penthouseHit",
  edge,
  surface,
});
const opening = (id: OpeningId): SimEvent => ({
  ...at(0, 1, 0),
  type: "enteredOpening",
  opening: id,
  surface: `opening:${id}`,
});
const net = (face: Side, cord = false): SimEvent => ({
  ...at(0, 0.5, 0),
  type: "netHit",
  face,
  cord,
  surface: "net",
});
const simple = (type: "tambourHit" | "outOfCourt" | "nick" | "restOnFloor", z = 0): SimEvent =>
  ({ ...at(-hw, 0.03, z), type, surface: type === "tambourHit" ? "tambour" : "floor" }) as SimEvent;

/** A point in the Service Court, one in the Hazard Court, and one on the service side. */
const serviceCourt = bounce(hw - 0.5, hl - 1);
const hazardCourt = (fromLine: number) => bounce(0, serviceLineZ(court) - fromLine);
const serviceSide = (fromDedans: number) => bounce(0, -hl + fromDedans);

/** Served, on the Service Penthouse and dropped in the Service Court. */
const goodService = [
  hit(S, -5),
  roof("penthouse:side"),
  cross("service"),
  roof("penthouse:service"),
  serviceCourt,
];

function play(inputs: readonly RallyInput[], s: RallySetup = setup) {
  let state = startRally(s);
  const teaching: string[] = [];
  for (const e of inputs) {
    const r = rally(state, e);
    state = r.state;
    teaching.push(...r.teaching.map((t) => t.id));
  }
  return { outcome: state.outcome, teaching };
}
const outcome = (inputs: readonly RallyInput[], s?: RallySetup) => play(inputs, s).outcome;

describe("service (Law 8.1(d))", () => {
  it("is good onto the Service Penthouse and into the Service Court", () => {
    const { outcome: o, teaching } = play(goodService);
    expect(o).toBeNull();
    expect(teaching).toContain("goodService");
  });

  it("wins when it Falls in the Service Court unreturned (Law 11.1(b))", () => {
    expect(outcome([...goodService, bounce(hw - 1, hl - 0.5)])).toMatchObject({
      kind: "point",
      winner: S,
      reason: "beyondServiceLine",
    });
  });

  it("is good off the Service Wall first", () => {
    expect(
      outcome([hit(S, -5), wall("serviceWall"), roof("penthouse:service"), serviceCourt]),
    ).toBeNull();
  });

  it("wins outright into the Winning Gallery (Laws 8.1(d), 11.1(b))", () => {
    expect(outcome([...goodService.slice(0, 4), opening("winningGallery")])).toMatchObject({
      kind: "point",
      winner: S,
      reason: "winningGallery",
    });
  });

  it("allows the Grille Penthouse and High Back Wall after the Service Penthouse (boomerang)", () => {
    const { outcome: o, teaching } = play([
      ...goodService.slice(0, 4),
      roof("penthouse:grille"),
      wall("highBackWall:grille"),
      wall("grilleWall"),
      serviceCourt,
    ]);
    expect(o).toBeNull();
    expect(teaching).toContain("boomerang");
  });

  it.each([
    ["(i) on or over the line", [{ type: "serverFault", reason: "line" } as const], "faultLine"],
    ["(ii) missing the ball", [{ type: "serverFault", reason: "missed" } as const], "faultMissed"],
    ["(ii) hitting it twice", [hit(S, -5), hit(S, -5)], "faultDoubleHit"],
    ["(iii) the floor first", [hit(S, -5), bounce(2, -3)], "faultTouchedOther"],
    ["(iii) the Main Wall first", [hit(S, -5), wall("mainWall")], "faultTouchedOther"],
    [
      "(iii) the Dedans Penthouse first",
      [hit(S, -5), roof("penthouse:dedans")],
      "faultTouchedOther",
    ],
    ["(iii) the net", [hit(S, -5), net("service")], "faultTouchedOther"],
    [
      "(iv) the edge of the Side Penthouse first",
      [hit(S, -5), roof("penthouseEdge:side", true)],
      "faultPenthouseEdge",
    ],
    [
      "(v) off the Side Penthouse short of the Service Penthouse",
      [hit(S, -5), roof("penthouse:side"), bounce(hw - 1, -2)],
      "faultMissedServicePenthouse",
    ],
    [
      "(v) the edge of the Service Penthouse without touching first",
      [hit(S, -5), cross("service"), roof("penthouseEdge:service", true)],
      "faultMissedServicePenthouse",
    ],
    [
      "(vi) out of court",
      [hit(S, -5), roof("penthouse:side"), simple("outOfCourt")],
      "faultOutOfCourt",
    ],
    [
      "(vii) the Main Wall before dropping",
      [...goodService.slice(0, 4), wall("mainWall")],
      "faultMainWall",
    ],
    [
      "(vii) the Tambour before dropping",
      [...goodService.slice(0, 4), simple("tambourHit")],
      "faultMainWall",
    ],
    [
      "(viii) dropping in the Hazard Court",
      [...goodService.slice(0, 4), hazardCourt(2)],
      "faultDrop",
    ],
    [
      "(viii) dropping between the Fault Line and the Main Wall",
      [...goodService.slice(0, 4), bounce(-hw + 1, hl - 1)],
      "faultDrop",
    ],
    [
      "(viii) entering another gallery",
      [...goodService.slice(0, 4), opening("hazardDoor")],
      "faultDrop",
    ],
  ] as const)("faults %s", (_, inputs, reason) => {
    expect(outcome(inputs)).toEqual({ kind: "fault", reason });
  });

  it("lets the edge of the Service Penthouse count after the Side Penthouse (Law 8.1(d)(v))", () => {
    expect(
      outcome([
        hit(S, -5),
        roof("penthouse:side"),
        roof("penthouseEdge:service", true),
        serviceCourt,
      ]),
    ).toBeNull();
  });

  it("loses the rest for volleying before the Service Penthouse (Law 11.2(i))", () => {
    expect(
      outcome([hit(S, -5), roof("penthouse:side"), cross("service"), hit(R, 1)]),
    ).toMatchObject({
      winner: S,
      reason: "volleyBeforePenthouse",
    });
  });

  it("lets the receiver volley after the Service Penthouse, so (vii)–(viii) no longer apply", () => {
    const { outcome: o, teaching } = play([
      ...goodService.slice(0, 4),
      hit(R, 2),
      cross("hazard"),
      serviceSide(3),
    ]);
    expect(teaching).toContain("volleyedService");
    expect(o).toBeNull();
  });

  it("ignores the toss before the service is struck", () => {
    expect(outcome([bounce(hw - 2, -4), ...goodService])).toBeNull();
  });
});

describe("winning the rest (Law 11.1(b))", () => {
  const returned = [...goodService, hit(R, 3), cross("hazard")];

  it("enters the Dedans", () => {
    expect(outcome([...returned, opening("dedans")])).toMatchObject({
      kind: "point",
      winner: R,
      reason: "dedans",
    });
  });

  it("counts touching a gallery post as entering it (Law 2)", () => {
    expect(outcome([...returned, wall("post:lastGallery")])).toMatchObject({
      kind: "chase",
      call: { name: "the Last Gallery" },
    });
  });

  it("wins with the Grille and the Winning Gallery", () => {
    const back = [...returned, serviceSide(5), hit(S, -5), cross("service")];
    expect(outcome([...back, opening("grille")])).toMatchObject({ winner: S, reason: "grille" });
    expect(outcome([...back, opening("winningGallery")])).toMatchObject({ winner: S });
  });

  it("wins with a Fall on or beyond the Service Line", () => {
    const back = [...returned, serviceSide(5), hit(S, -5), cross("service")];
    expect(outcome([...back, bounce(0, hl - 3), bounce(-2, hl - 1)])).toMatchObject({
      winner: S,
      reason: "beyondServiceLine",
    });
  });
});

describe("laying chases (Law 9.2)", () => {
  const returned = [...goodService, hit(R, 3), cross("hazard")];

  it("lays a chase where a ball Falls on the service side", () => {
    const o = outcome([...returned, serviceSide(5), serviceSide(1.71)]);
    expect(o).toMatchObject({
      kind: "chase",
      call: { name: chaseName(court, { side: "service", distance: 1.71 }).name },
      reason: "chaseLaid",
    });
  });

  it("lays a hazard chase in the Hazard Court, measured from the Service Line", () => {
    const o = outcome([
      ...returned,
      serviceSide(5),
      hit(S, -5),
      cross("service"),
      hazardCourt(3),
      hazardCourt(1),
    ]);
    expect(o).toMatchObject({
      kind: "chase",
      call: { mark: { side: "hazard", distance: expect.closeTo(1) } },
    });
  });

  it("marks the gallery line for a ball entering a gallery (Law 9.2(b))", () => {
    const o = outcome([...returned, opening("door")]);
    expect(o).toMatchObject({ kind: "chase", call: { name: "the Door" } });
  });

  it("makes Chase the Line for a Fall into the far side of the net (Laws 2, 9.2(b)(iv))", () => {
    const o = outcome([...returned, serviceSide(13), net("service")]);
    expect(o).toMatchObject({
      kind: "chase",
      call: { name: "Chase the Line" },
      reason: "chaseTheLine",
    });
  });

  it("makes Chase the Line when the ball drops and comes back over (050 decision 7)", () => {
    const o = outcome([...returned, serviceSide(13), cross("service"), bounce(0, 1)]);
    expect(o).toMatchObject({ kind: "chase", call: { name: "Hazard Chase the Line" } });
  });

  it("uses the rest position when the ball rolls dead after one bounce", () => {
    const o = outcome([...returned, serviceSide(8), simple("restOnFloor", -hl + 6)]);
    expect(o).toMatchObject({ kind: "chase", call: { mark: { side: "service" } } });
  });

  it("teaches the nick", () => {
    expect(play([...returned, simple("nick")]).teaching).toContain("nick");
  });
});

describe("losing the rest (Law 11.2)", () => {
  const returned = [...goodService, hit(R, 3)];

  it("(c) not passing the net", () => {
    expect(outcome([...returned, net("hazard"), bounce(0, 1)])).toMatchObject({
      winner: S,
      reason: "notOverNet",
    });
  });

  it("(c) entering an opening, or hitting the net post, before passing the net", () => {
    expect(outcome([...returned, opening("hazardDoor")])).toMatchObject({
      winner: S,
      reason: "notOverNet",
    });
    expect(outcome([...returned, wall("netPost")])).toMatchObject({
      winner: S,
      reason: "notOverNet",
    });
  });

  it("lets a net cord that carries over play on", () => {
    expect(outcome([...returned, net("hazard", true), cross("hazard"), serviceSide(4)])).toBeNull();
  });

  it("(d) out of court", () => {
    expect(outcome([...returned, cross("hazard"), simple("outOfCourt")])).toMatchObject({
      winner: S,
      reason: "outOfCourt",
    });
  });

  it("(e) hitting the ball twice", () => {
    expect(outcome([...returned, hit(R, 3)])).toMatchObject({ winner: S, reason: "doubleHit" });
  });

  it("(f) the ball touching a player, whoever struck it (050 decision 6)", () => {
    const touched = (player: string): SimEvent => ({
      ...at(0, 1, -3),
      type: "playerHit",
      player,
      surface: "player",
    });
    expect(outcome([...returned, cross("hazard"), touched(S)])).toMatchObject({
      winner: R,
      reason: "touchedByBall",
    });
    expect(outcome([...returned, touched(R)])).toMatchObject({ winner: S });
  });

  it("(g) striking the ball before it comes over", () => {
    expect(outcome([...returned, hit(S, 2)])).toMatchObject({ winner: R, reason: "notYetOver" });
  });

  it("(g) except after it dropped on the striker's side and bounced back", () => {
    expect(
      outcome([...returned, cross("hazard"), serviceSide(13), cross("service"), hit(S, 0.5)]),
    ).toBeNull();
  });

  it("(h) touching the net", () => {
    expect(outcome([...returned, { type: "netTouched", player: R }])).toMatchObject({
      winner: S,
      reason: "touchedNet",
    });
  });

  it("(j) coming back over the net and dropping on the striker's side", () => {
    expect(outcome([...returned, cross("hazard"), cross("service"), bounce(0, 4)])).toMatchObject({
      winner: S,
      reason: "cameBack",
    });
  });
});

describe("playing off a chase (Law 9.3(b))", () => {
  /** Chase better than two on the service side: the hazard-end player attacks. */
  const two = chaseName(court, { side: "service", distance: 1.75 });
  const playing = { ...setup, playingFor: two };
  const attack = (fromDedans: number) =>
    outcome(
      [...goodService, hit(R, 3), cross("hazard"), serviceSide(5), serviceSide(fromDedans)],
      playing,
    );

  it("wins for the attacker with a better Fall", () => {
    expect(attack(1)).toMatchObject({ winner: R, reason: "chaseWon" });
  });

  it("loses for the attacker with a worse Fall", () => {
    expect(attack(3)).toMatchObject({ winner: S, reason: "chaseLost" });
  });

  it("is Chase Off when equal, within a ball's width (vi)", () => {
    expect(attack(1.75 + 0.05)).toEqual({ kind: "chaseOff", call: two });
  });

  it("can't lay a new chase while one is played for", () => {
    expect(attack(3)?.kind).toBe("point");
  });

  it("(iii) loses for the hazard-side player on a Fall on the hazard side", () => {
    expect(outcome([...goodService, hazardCourt(2)], playing)).toMatchObject({
      winner: S,
      reason: "wrongSide",
    });
  });

  it("(iv) loses for the service-side player on a Fall on the service side, playing off a hazard chase", () => {
    const hazard = chaseName(court, { side: "hazard", distance: 2 });
    const o = outcome(
      [...goodService, hit(R, 3), cross("hazard"), serviceSide(5), serviceSide(2)],
      {
        ...setup,
        playingFor: hazard,
      },
    );
    expect(o).toMatchObject({ winner: R, reason: "wrongSide" });
  });

  it("lets the server attack a hazard chase, beating it nearer the Service Line", () => {
    const hazard = chaseName(court, { side: "hazard", distance: 2 });
    const s = { ...setup, playingFor: hazard };
    expect(
      outcome([...goodService.slice(0, 4), hazardCourt(3), hazardCourt(0.5)], s),
    ).toMatchObject({
      kind: "fault",
    });
    const rest = [
      ...goodService,
      hit(R, 3),
      cross("hazard"),
      serviceSide(8),
      hit(S, -5),
      cross("service"),
    ];
    expect(outcome([...rest, hazardCourt(3), hazardCourt(0.5)], s)).toMatchObject({
      winner: S,
      reason: "chaseWon",
    });
    expect(outcome([...rest, hazardCourt(3), hazardCourt(4)], s)).toMatchObject({
      winner: R,
      reason: "chaseLost",
    });
  });

  it("(v) applies the Law 11.2 losses as normal", () => {
    expect(
      outcome([...goodService, hit(R, 3), cross("hazard"), simple("outOfCourt")], playing),
    ).toMatchObject({
      winner: S,
      reason: "outOfCourt",
    });
  });
});

describe("lets (Law 10)", () => {
  it.each([
    ["receiverNotReady", "letNotReady"],
    ["hindrance", "letHindrance"],
  ] as const)("calls a let for %s", (reason, id) => {
    expect(outcome([...goodService, { type: "let", reason }])).toEqual({ kind: "let", reason: id });
  });
});

describe("rally", () => {
  it("ignores everything once the rest is decided", () => {
    const { outcome: o, teaching } = play([
      hit(S, -5),
      wall("mainWall"),
      roof("penthouse:service"),
      serviceCourt,
    ]);
    expect(o).toEqual({ kind: "fault", reason: "faultTouchedOther" });
    expect(teaching).toEqual(["faultTouchedOther"]);
  });
});
