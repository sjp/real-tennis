import { chaseLabel, chaseName, ON_LINE_TOLERANCE, type ChaseCall } from "../court/chase.ts";
import { classifyFloorPoint, serviceLineZ } from "../court/classify.ts";
import type { ChaseMark, CourtDefinition, FloorPoint, OpeningId, Side } from "../court/types.ts";
import type { SimEvent } from "../sim/events.ts";
import { teach, type TeachingEvent, type TeachingId } from "./teaching.ts";

export type PlayerId = string;

export interface RallySetup {
  readonly court: CourtDefinition;
  /** Always at the service end (Law 8.1(a)). */
  readonly server: PlayerId;
  readonly receiver: PlayerId;
  /** The chase being played off, or null when a Fall lays a chase (Law 9.2). */
  readonly playingFor: ChaseCall | null;
}

/** What the game reports beyond the physics. */
export type GameEvent =
  /** On or past the Second Gallery line, or missing the ball (Law 8.1(d)(i)–(ii)). */
  | { readonly type: "serverFault"; readonly reason: "line" | "missed" }
  | { readonly type: "netTouched"; readonly player: PlayerId }
  /** The receiver made no attempt as they weren't ready, or the players collided. */
  | { readonly type: "let"; readonly reason: "receiverNotReady" | "hindrance" };

export type RallyInput = SimEvent | GameEvent;

export type RallyOutcome =
  | { readonly kind: "point"; readonly winner: PlayerId; readonly reason: TeachingId }
  | { readonly kind: "fault"; readonly reason: TeachingId }
  | { readonly kind: "chase"; readonly call: ChaseCall; readonly reason: TeachingId }
  | { readonly kind: "chaseOff"; readonly call: ChaseCall }
  | { readonly kind: "let"; readonly reason: TeachingId };

export interface RallyState {
  readonly setup: RallySetup;
  /** Who struck the ball last, or null before the service. */
  readonly striker: PlayerId | null;
  /** The ball in play is the service and hasn't yet dropped or been volleyed. */
  readonly service: boolean;
  /** The service has touched the Service Penthouse. */
  readonly penthouse: boolean;
  /** The service has touched the Side Penthouse or the Service Wall. */
  readonly touched: boolean;
  /** The service has come back off the Grille end, and the Marker has said so. */
  readonly boomerang: boolean;
  /** The current stroke has passed the net. */
  readonly crossed: boolean;
  /** …and come back over it to the striker's side. */
  readonly cameBack: boolean;
  /** Where the current stroke dropped (Law 2), if it has. */
  readonly drop: Side | null;
  /** Set once the rest is decided; later inputs change nothing. */
  readonly outcome: RallyOutcome | null;
}

export interface RallyStep {
  readonly state: RallyState;
  readonly teaching: readonly TeachingEvent[];
}

/**
 * A rest about to start with the service. Pass `striker` to start one with a
 * ball already struck (e.g. by the practice machine), not yet over the net.
 */
export function startRally(setup: RallySetup, striker: PlayerId | null = null): RallyState {
  return {
    setup,
    striker,
    service: striker === null,
    penthouse: false,
    touched: false,
    boomerang: false,
    crossed: false,
    cameBack: false,
    drop: null,
    outcome: null,
  };
}

const other = (s: Side): Side => (s === "service" ? "hazard" : "service");
const sideOf = (z: number): Side => (z < 0 ? "service" : "hazard");
const floor = (p: { x: number; z: number }): FloorPoint => ({ x: p.x, z: p.z });

/** Feeds one event to the rest. */
export function rally(state: RallyState, input: RallyInput): RallyStep {
  if (state.outcome) return { state, teaching: [] };
  return new Rally(state).on(input);
}

class Rally {
  readonly teaching: TeachingEvent[] = [];
  readonly s: RallyState;
  constructor(s: RallyState) {
    this.s = s;
  }

  get court() {
    return this.s.setup.court;
  }
  endOf(p: PlayerId): Side {
    return p === this.s.setup.server ? "service" : "hazard";
  }
  at(side: Side): PlayerId {
    return side === "service" ? this.s.setup.server : this.s.setup.receiver;
  }
  opponent(p: PlayerId): PlayerId {
    return this.at(other(this.endOf(p)));
  }

  next(change: Partial<RallyState>): RallyStep {
    return { state: { ...this.s, ...change }, teaching: this.teaching };
  }
  decide(outcome: RallyOutcome, detail?: string): RallyStep {
    const id = outcome.kind === "chaseOff" ? "chaseOff" : outcome.reason;
    this.teaching.push(teach(id, detail));
    return this.next({ outcome });
  }
  point(winner: PlayerId, reason: TeachingId) {
    return this.decide({ kind: "point", winner, reason });
  }
  lose(loser: PlayerId, reason: TeachingId) {
    return this.point(this.opponent(loser), reason);
  }
  fault(reason: TeachingId) {
    return this.decide({ kind: "fault", reason });
  }

  on(e: RallyInput): RallyStep {
    const s = this.s;
    switch (e.type) {
      case "let":
        return this.decide({
          kind: "let",
          reason: e.reason === "hindrance" ? "letHindrance" : "letNotReady",
        });
      case "netTouched":
        return this.lose(e.player, "touchedNet");
      case "serverFault":
        if (!s.service) return this.next({});
        return this.fault(e.reason === "line" ? "faultLine" : "faultMissed");
      case "racketHit":
        return this.struck(e.player, e.position.z);
    }
    // Before the service, the ball is just being tossed.
    if (s.striker === null) return this.next({});
    switch (e.type) {
      case "netCrossed":
        return e.from === this.endOf(s.striker)
          ? this.next({ crossed: true, cameBack: false })
          : this.next({ cameBack: true });
      case "playerHit":
        return this.lose(e.player, "touchedByBall");
      case "nick":
        this.teaching.push(teach("nick"));
        return this.next({});
    }
    if (s.service) return s.penthouse ? this.serviceAfter(e) : this.serviceBefore(e);
    return this.open(e);
  }

  struck(player: PlayerId, z: number): RallyStep {
    const s = this.s;
    if (s.striker === null)
      // Only the server can start the rest; anyone else's hit is ignored (230).
      return player === s.setup.server
        ? this.next({ striker: player, service: true })
        : this.next({});
    if (player === s.striker)
      return s.service ? this.fault("faultDoubleHit") : this.lose(player, "doubleHit");
    if (s.service && !s.penthouse) return this.lose(player, "volleyBeforePenthouse");
    // Law 11.2(g): not before it's over, unless it dropped on this side and came back.
    const end = this.endOf(player);
    if (sideOf(z) !== end && s.drop !== end) return this.lose(player, "notYetOver");
    if (s.service) this.teaching.push(teach("volleyedService"));
    return this.next({
      striker: player,
      service: false,
      crossed: false,
      cameBack: false,
      drop: null,
    });
  }

  /** Law 8.1(d)(iii)–(vi): on the way to the Service Penthouse. */
  serviceBefore(e: SimEvent): RallyStep {
    const s = this.s;
    const missed = s.touched ? "faultMissedServicePenthouse" : "faultTouchedOther";
    switch (e.type) {
      case "penthouseHit":
        switch (e.surface) {
          case "penthouse:service":
            return this.next({ penthouse: true });
          case "penthouseEdge:service":
            return s.touched
              ? this.next({ penthouse: true })
              : this.fault("faultMissedServicePenthouse");
          case "penthouse:side":
            return this.next({ touched: true });
          case "penthouseEdge:side":
            return this.fault(s.touched ? "faultMissedServicePenthouse" : "faultPenthouseEdge");
          default:
            return this.fault("faultTouchedOther");
        }
      case "wallHit":
        return e.surface === "serviceWall"
          ? this.next({ touched: true })
          : this.fault("faultTouchedOther");
      case "outOfCourt":
        return this.fault("faultOutOfCourt");
      default:
        return this.fault(missed);
    }
  }

  /** Law 8.1(d)(vii)–(viii): from the Service Penthouse to the drop. */
  serviceAfter(e: SimEvent): RallyStep {
    switch (e.type) {
      case "penthouseHit":
        return e.surface.endsWith(":grille") ? this.boomerang() : this.next({});
      case "wallHit":
        if (e.surface === "mainWall") return this.fault("faultMainWall");
        if (e.surface.startsWith("post:")) return this.serviceOpening(postOf(e.surface));
        return e.surface === "highBackWall:grille" ? this.boomerang() : this.next({});
      case "tambourHit":
        return this.fault("faultMainWall");
      case "outOfCourt":
        return this.fault("faultOutOfCourt");
      case "enteredOpening":
        return this.serviceOpening(e.opening);
      case "floorBounce":
        if (!classifyFloorPoint(this.court, floor(e.position)).inServiceCourt)
          return this.fault("faultDrop");
        this.teaching.push(teach("goodService"));
        return this.next({ service: false, crossed: true, drop: "hazard" });
      default:
        return this.fault("faultDrop");
    }
  }

  /** Said once, however many times the ball touches the Grille end. */
  boomerang(): RallyStep {
    if (!this.s.boomerang) this.teaching.push(teach("boomerang"));
    return this.next({ boomerang: true });
  }

  serviceOpening(id: OpeningId): RallyStep {
    return id === "winningGallery" ? this.point(this.s.setup.server, id) : this.fault("faultDrop");
  }

  /** Any stroke after the service. */
  open(e: SimEvent): RallyStep {
    const s = this.s;
    const striker = s.striker!;
    switch (e.type) {
      case "outOfCourt":
        return this.lose(striker, "outOfCourt");
      case "enteredOpening":
        return this.opening(e.opening);
      case "wallHit":
        if (e.surface === "netPost" && !s.crossed) return this.lose(striker, "notOverNet");
        if (e.surface.startsWith("post:")) return this.opening(postOf(e.surface));
        return this.next({});
      case "netHit":
        // Law 2: touching the far side of the net after the drop is a Fall.
        if (s.crossed && s.drop !== null && e.face === s.drop) return this.chaseTheLine(s.drop);
        return this.next({});
      case "floorBounce":
      case "restOnFloor": {
        const side = sideOf(e.position.z);
        if (!s.crossed) return this.lose(striker, "notOverNet");
        if (side === this.endOf(striker)) {
          return s.drop === null ? this.lose(striker, "cameBack") : this.chaseTheLine(side);
        }
        if (s.drop === null && e.type === "floorBounce") return this.next({ drop: side });
        return this.fallAt(floor(e.position));
      }
      default:
        return this.next({});
    }
  }

  opening(id: OpeningId): RallyStep {
    const striker = this.s.striker!;
    if (!this.s.crossed) return this.lose(striker, "notOverNet");
    const o = this.court.openings.find((o) => o.id === id)!;
    if (o.outcome.kind === "win") {
      const reason = id === "dedans" || id === "grille" ? id : "winningGallery";
      return this.point(striker, reason);
    }
    const line = o.outcome.line;
    const distance =
      line === "chaseTheLine" || line === "hazardChaseTheLine"
        ? netDistance(this.court, o.side)
        : this.court.chaseLines.find((l) => l.id === line)!.distance;
    return this.fell({ side: o.side, distance }, "chaseLaid");
  }

  fallAt(p: FloorPoint): RallyStep {
    const c = classifyFloorPoint(this.court, p);
    if (c.beyondServiceLine) return this.point(this.s.striker!, "beyondServiceLine");
    return this.fell(c.chaseMark!, "chaseLaid");
  }

  /** Law 9.2(b)(iv), and 050 decision 7. */
  chaseTheLine(side: Side): RallyStep {
    return this.fell({ side, distance: netDistance(this.court, side) }, "chaseTheLine");
  }

  /** A Fall that makes a chase: laid, or played off against (Law 9.3(b)). */
  fell(mark: ChaseMark, reason: TeachingId): RallyStep {
    const call = chaseName(this.court, mark);
    const chase = this.s.setup.playingFor;
    if (!chase) return this.decide({ kind: "chase", call, reason }, chaseLabel(call));
    const attacker = this.at(other(chase.mark.side));
    // Law 9.3(b)(iii)–(iv): a Fall on the attacker's own side.
    if (mark.side !== chase.mark.side) return this.lose(attacker, "wrongSide");
    const diff = mark.distance - chase.mark.distance;
    if (Math.abs(diff) <= ON_LINE_TOLERANCE)
      return this.decide({ kind: "chaseOff", call: chase }, chaseLabel(chase));
    return diff < 0 ? this.point(attacker, "chaseWon") : this.lose(attacker, "chaseLost");
  }
}

function postOf(surface: string): OpeningId {
  return surface.slice("post:".length) as OpeningId;
}

/** A chase mark's distance at the net, on either side. */
function netDistance(court: CourtDefinition, side: Side): number {
  return side === "service" ? court.floor.length / 2 : serviceLineZ(court);
}
