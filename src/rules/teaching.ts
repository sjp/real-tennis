/**
 * What the Marker explains as play goes on. 070 keys its explanations by
 * these ids. Text is paraphrased from the T&RA Laws, never quoted.
 */
export type TeachingId =
  // Service faults (Law 8.1(d)).
  | "faultLine"
  | "faultMissed"
  | "faultDoubleHit"
  | "faultTouchedOther"
  | "faultPenthouseEdge"
  | "faultMissedServicePenthouse"
  | "faultOutOfCourt"
  | "faultMainWall"
  | "faultDrop"
  | "doubleFault"
  // Service.
  | "goodService"
  | "boomerang"
  | "volleyedService"
  | "volleyBeforePenthouse"
  // Winning the rest (Law 11.1(b)).
  | "dedans"
  | "grille"
  | "winningGallery"
  | "beyondServiceLine"
  // Losing the rest (Law 11.2).
  | "notOverNet"
  | "outOfCourt"
  | "doubleHit"
  | "touchedByBall"
  | "notYetOver"
  | "touchedNet"
  | "cameBack"
  // Chases (Laws 2, 8.2, 9).
  | "nick"
  | "chaseLaid"
  | "chaseTheLine"
  | "changeEnds"
  | "playOff"
  | "chaseWon"
  | "chaseLost"
  | "chaseOff"
  | "wrongSide"
  | "chasesAnnulled"
  // Lets (Law 10).
  | "letNotReady"
  | "letHindrance"
  // Scoring.
  | "coinToss"
  | "suddenDeath"
  | "game"
  | "set"
  | "match";

export interface TeachingEvent {
  readonly id: TeachingId;
  /** The Law it comes from, e.g. "8.1(d)(v)". */
  readonly law: string;
  readonly message: string;
}

export const TEACHING: Readonly<Record<TeachingId, { law: string; text: string }>> = {
  faultLine: {
    law: "8.1(d)(i)",
    text: "Fault: the server served from on or past the Second Gallery line",
  },
  faultMissed: { law: "8.1(d)(ii)", text: "Fault: the server missed the ball" },
  faultDoubleHit: { law: "8.1(d)(ii)", text: "Fault: the server hit the ball twice" },
  faultTouchedOther: {
    law: "8.1(d)(iii)",
    text: "Fault: before the Service Penthouse, the service touched something other than the Side Penthouse or the Service Wall",
  },
  faultPenthouseEdge: {
    law: "8.1(d)(iv)",
    text: "Fault: the service first touched the edge of the Side Penthouse",
  },
  faultMissedServicePenthouse: {
    law: "8.1(d)(v)",
    text: "Fault: the service left the penthouse without touching the Service Penthouse",
  },
  faultOutOfCourt: { law: "8.1(d)(vi)", text: "Fault: the service went out of court" },
  faultMainWall: {
    law: "8.1(d)(vii)",
    text: "Fault: the service hit the Main Wall or the Tambour before dropping",
  },
  faultDrop: {
    law: "8.1(d)(viii)",
    text: "Fault: the service didn't drop in the Service Court or enter the Winning Gallery",
  },
  doubleFault: { law: "11.2(b)", text: "Two faults in a row: the server loses the rest" },
  goodService: {
    law: "8.1(d)",
    text: "Good service: it touched the Service Penthouse and dropped in the Service Court",
  },
  boomerang: {
    law: "8.1(d)",
    text: "The service came back off the Grille end, which is allowed after the Service Penthouse",
  },
  volleyedService: {
    law: "11.2(i)",
    text: "The receiver volleyed the service after it touched the Service Penthouse",
  },
  volleyBeforePenthouse: {
    law: "11.2(i)",
    text: "The receiver struck the service before it touched the Service Penthouse, and loses the rest",
  },
  dedans: { law: "11.1(b)", text: "Dedans! The striker wins the rest" },
  grille: { law: "11.1(b)", text: "Grille! The striker wins the rest" },
  winningGallery: { law: "11.1(b)", text: "Winning Gallery! The striker wins the rest" },
  beyondServiceLine: {
    law: "11.1(b)",
    text: "The ball fell on or beyond the Service Line: the striker wins the rest",
  },
  notOverNet: { law: "11.2(c)", text: "The ball didn't pass the net: the striker loses the rest" },
  outOfCourt: { law: "11.2(d)", text: "Out of court: the striker loses the rest" },
  doubleHit: { law: "11.2(e)", text: "The striker hit the ball twice and loses the rest" },
  touchedByBall: { law: "11.2(f)", text: "The ball touched a player, who loses the rest" },
  notYetOver: {
    law: "11.2(g)",
    text: "The ball was struck before it came over the net, and the striker loses the rest",
  },
  touchedNet: { law: "11.2(h)", text: "A player touched the net and loses the rest" },
  cameBack: {
    law: "11.2(j)",
    text: "The ball came back over the net and dropped on the striker's side: the striker loses the rest",
  },
  nick: { law: "2", text: "A nick: the ball met the wall and the floor together" },
  chaseLaid: { law: "9.2", text: "Chase laid" },
  chaseTheLine: {
    law: "9.2(b)(iv)",
    text: "The ball fell back into the net, or back over it, after dropping: Chase the Line",
  },
  changeEnds: { law: "8.2", text: "Change ends" },
  playOff: { law: "9.3(a)", text: "Playing off" },
  chaseWon: { law: "9.3(b)", text: "Better than the chase: the attacker wins the rest" },
  chaseLost: { law: "9.3(b)", text: "Worse than the chase: the attacker loses the rest" },
  chaseOff: { law: "9.3(b)(vi)", text: "Chase off: equal to the chase, so it's annulled" },
  wrongSide: {
    law: "9.3(b)(iii)–(iv)",
    text: "Playing off a chase, the ball fell on the attacker's own side: the attacker loses the rest",
  },
  chasesAnnulled: {
    law: "9.3(c)(iii)",
    text: "The game is won, so the outstanding chases are annulled",
  },
  letNotReady: { law: "10(c)(i)", text: "Let: the receiver wasn't ready" },
  letHindrance: { law: "10", text: "Let: the players got in each other's way" },
  coinToss: { law: "7.1", text: "The toss decides who serves first" },
  suddenDeath: { law: "12.1(b)", text: "Forty-all: the next rest wins the game" },
  game: { law: "12.1", text: "Game" },
  set: { law: "13", text: "Set" },
  match: { law: "13", text: "Game, set and match" },
};

/** A teaching event, with `detail` (e.g. the chase) after the text. */
export function teach(id: TeachingId, detail?: string): TeachingEvent {
  const { law, text } = TEACHING[id];
  return { id, law, message: detail ? `${text}: ${detail}` : text };
}
