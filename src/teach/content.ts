import type { CourtFeature } from "../court/features.ts";
import type { TeachingId } from "../rules/teaching.ts";

/**
 * What the Marker explains the first time each call is made (070). The text
 * is paraphrased from the T&RA Laws (summarised in issue 003), never quoted.
 * The Law is the call's own, from `TEACHING`.
 */
export interface Explanation {
  readonly title: string;
  /** Two to four sentences: what happened and why. */
  readonly text: string;
  /** What to do about it, if there's anything to do. Control phrases are `{name}` (wording.ts). */
  readonly tip?: string;
  /** The part of the court to highlight. */
  readonly feature?: CourtFeature;
}

export const EXPLANATIONS: Readonly<Record<TeachingId, Explanation>> = {
  // Service faults.
  faultLine: {
    title: "Fault: over the line",
    text: "The server must stay behind the Second Gallery line on the service side. Touching that line, or anywhere nearer the net, as you serve is a fault.",
    tip: "Serve from further back, towards the Dedans.",
    feature: "secondGalleryLine",
  },
  faultMissed: {
    title: "Fault: missed the ball",
    text: "If the server misses the ball, or doesn't strike it cleanly, the service is a fault.",
    tip: "{toss}",
  },
  faultDoubleHit: {
    title: "Fault: hit twice",
    text: "The server may strike the ball only once. Hitting it twice is a fault.",
  },
  faultTouchedOther: {
    title: "Fault: touched something else first",
    text: "A service must travel along the Side Penthouse or the Service Wall above it on its way to the hazard end. Touching anything else before it reaches the Service Penthouse is a fault.",
    tip: "Aim up and to your right, onto the roof above the galleries.",
    feature: "sidePenthouse",
  },
  faultPenthouseEdge: {
    title: "Fault: the penthouse edge",
    text: "If the first thing the service touches is the edge of the Side Penthouse, it's a fault. It has to land on the roof or the wall above it.",
    feature: "sidePenthouse",
  },
  faultMissedServicePenthouse: {
    title: "Fault: missed the Service Penthouse",
    text: "Every service must touch the Service Penthouse: the part of the Side Penthouse on the hazard side of the net. This one came off the roof before reaching it.",
    tip: "Serve with more length, so the ball is still on the roof past the net.",
    feature: "servicePenthouse",
  },
  faultOutOfCourt: {
    title: "Fault: out of court",
    text: "The service went above the Out of Court line, or into the roof. That's a fault.",
    feature: "outOfCourt",
  },
  faultMainWall: {
    title: "Fault: the Main Wall",
    text: "After the Service Penthouse, the service must drop without touching the Main Wall or the Tambour. Unless the receiver volleys it, hitting either is a fault.",
    feature: "mainWall",
  },
  faultDrop: {
    title: "Fault: dropped outside the Service Court",
    text: "A good service drops in the Service Court: beyond the Service Line and between the Fault Line and the Side Wall. Dropping anywhere else, including in the pass by the Main Wall, is a fault. The only other way in is the Winning Gallery.",
    feature: "serviceCourt",
  },
  doubleFault: {
    title: "Double fault",
    text: "Two faults in a row lose the rest for the server. A let in between doesn't wipe out the first fault.",
    tip: "After one fault, a safe, simple service is worth more than a clever one.",
  },
  // Service.
  goodService: {
    title: "A good service",
    text: "Every rest starts with the service, always from the service end. It must touch the Service Penthouse, then drop in the Service Court (or go into the Winning Gallery).",
    tip: "The receiver may play the ball once it has touched the Service Penthouse.",
    feature: "servicePenthouse",
  },
  boomerang: {
    title: "Off the Grille end",
    text: "After touching the Service Penthouse, a service may hit the Grille Penthouse or the wall above it and come back. That's still a good service, sometimes called a boomerang.",
    feature: "grilleEnd",
  },
  volleyedService: {
    title: "Volleying the service",
    text: "The receiver may volley the service once it has touched the Service Penthouse. A volleyed service can't then be a fault for where it would have dropped.",
    feature: "servicePenthouse",
  },
  volleyBeforePenthouse: {
    title: "Too soon",
    text: "The receiver may not strike the service until it has touched the Service Penthouse. Striking it earlier loses the rest.",
    tip: "Wait for the ball to come off the roof.",
    feature: "servicePenthouse",
  },
  // Winning the rest.
  dedans: {
    title: "Dedans",
    text: "The Dedans is the big netted opening in the back wall at the service end. A ball struck into it wins the rest outright. Spectators traditionally watch from behind its net.",
    tip: "From the hazard end, a hard, low ball at the Dedans is the classic attacking shot.",
    feature: "opening:dedans",
  },
  grille: {
    title: "Grille",
    text: "The Grille is a small opening in the corner of the Grille Wall, next to the Main Wall. A ball into it wins the rest outright.",
    feature: "opening:grille",
  },
  winningGallery: {
    title: "Winning Gallery",
    text: "The Winning Gallery is the hazard-side gallery nearest the Grille Wall. A ball into it wins the rest outright. Many courts hang a bell in it.",
    feature: "opening:winningGallery",
  },
  beyondServiceLine: {
    title: "On or beyond the Service Line",
    text: "At the hazard end, a ball that Falls (bounces a second time) on or beyond the Service Line wins the rest for the striker. A Fall short of it, in the Hazard Court, lays a hazard chase instead.",
    tip: "Defend the back of the hazard end: get the ball before its second bounce.",
    feature: "serviceLine",
  },
  // Losing the rest.
  notOverNet: {
    title: "Not over the net",
    text: "A stroke must pass the net. If it doesn't, the striker loses the rest.",
    feature: "net",
  },
  outOfCourt: {
    title: "Out of court",
    text: "The walls and penthouses are in play, but only below the Out of Court line. A ball that touches the line, the wall above it or the roof loses the rest for the striker.",
    feature: "outOfCourt",
  },
  doubleHit: {
    title: "Hit twice",
    text: "A player may strike the ball only once per stroke. Hitting it twice loses the rest.",
  },
  touchedByBall: {
    title: "Touched by the ball",
    text: "If the ball touches a player, or anything they wear or carry other than the racket in a stroke, that player loses the rest.",
    tip: "Get out of the way of a ball you aren't going to play.",
  },
  notYetOver: {
    title: "Not yet over",
    text: "You may only strike the ball once it has come over the net to your side. Reaching over to strike it early loses the rest.",
    feature: "net",
  },
  touchedNet: {
    title: "Touched the net",
    text: "A player who touches the net, with their body or racket, loses the rest.",
    feature: "net",
  },
  cameBack: {
    title: "Came back",
    text: "This ball passed the net, came back over it and dropped on the striker's own side. The striker loses the rest.",
    feature: "net",
  },
  // Chases.
  nick: {
    title: "A nick",
    text: "The ball landed in the corner, touching the wall and the floor at once. That's a nick, and it counts as hitting the wall first. It skids away low and is hard to return.",
  },
  chaseLaid: {
    title: "A chase",
    text: "A ball that Falls on the service side, or in the Hazard Court, doesn't win or lose the rest. Instead the Marker lays a chase: the spot is remembered and played for later, when the players change ends. The score doesn't change yet.",
    tip: "At the service end, a chase near the back wall is a good one to have laid against you: it's hard for your opponent to beat.",
    feature: "chaseLines",
  },
  chaseTheLine: {
    title: "Chase the Line",
    text: "The ball dropped on the far side and then fell back into the net, or over it. That lays the worst chase of all, Chase the Line, against the striker.",
    feature: "net",
  },
  changeEnds: {
    title: "Change ends",
    text: "In real tennis you only change ends because of chases. The players change when two chases are laid, or when one is laid and either player is on forty or advantage. The receiver becomes the server.",
    tip: "Winning a chase also wins you the service end.",
    feature: "hazardEnd",
  },
  playOff: {
    title: "Playing off a chase",
    text: "After changing ends, each chase is played for in turn, one rest each. The player attacking the chase tries to make the ball Fall better than it: nearer the back wall than the chase mark.",
    tip: "Defending, let a ball go if you think it will Fall worse than the chase.",
    feature: "chaseLines",
  },
  chaseWon: {
    title: "Beat the chase",
    text: "The attacker made the ball Fall better than the chase (nearer the back wall), and wins the rest.",
    feature: "chaseLines",
  },
  chaseLost: {
    title: "Lost the chase",
    text: "The ball Fell worse than the chase (nearer the net), so the attacker loses the rest.",
    feature: "chaseLines",
  },
  chaseOff: {
    title: "Chase off",
    text: "The ball Fell exactly on the chase. Nobody wins the rest, the score stays the same, and the chase is cancelled.",
  },
  wrongSide: {
    title: "The wrong side",
    text: "Playing off a chase, the attacker must make the ball Fall on the defender's side of the net. A Fall on their own side loses the rest.",
  },
  chasesAnnulled: {
    title: "Chases annulled",
    text: "A game ended with chases still waiting to be played. They're cancelled: a new game starts with no chases.",
  },
  // Lets.
  letNotReady: {
    title: "Let: not ready",
    text: "The receiver wasn't ready and made no attempt to return the service. The rest is replayed.",
  },
  letHindrance: {
    title: "Let: hindrance",
    text: "The players got in each other's way, so the Marker calls a let and the rest is replayed. Any service fault before it still stands.",
  },
  // Scoring.
  coinToss: {
    title: "The toss",
    text: "A toss of a coin or spin of a racket decides who starts at the service end. The winner usually chooses to serve, since the server keeps serving until the players change ends.",
    feature: "serviceEnd",
  },
  suddenDeath: {
    title: "Sudden death",
    text: "With the sudden-death option, at forty-all the next rest wins the game: there's no advantage.",
  },
  game: {
    title: "Game",
    text: "Scoring is like lawn tennis: fifteen, thirty, forty, game, with deuce and advantage. Unlike lawn tennis, players don't change ends between games, only because of chases.",
  },
  set: {
    title: "Set",
    text: "A set goes to the first player to win six games. There's no need to win by two and no tie-break, so 6–5 is a finished set.",
  },
  match: {
    title: "Game, set and match",
    text: "The match is won by winning the agreed number of sets: best of one, three or five.",
  },
};
