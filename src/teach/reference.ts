import type { CourtFeature } from "../court/features.ts";

/**
 * The in-game rules reference (070), by topic. Paraphrased from the T&RA
 * Laws (summarised in issue 003), never quoted, with the Laws cited.
 */
export type Topic = "court" | "service" | "scoring" | "chases" | "openings";

export const TOPICS: readonly { readonly id: Topic; readonly name: string }[] = [
  { id: "court", name: "The court" },
  { id: "service", name: "Service" },
  { id: "scoring", name: "Scoring" },
  { id: "chases", name: "Chases" },
  { id: "openings", name: "Openings" },
];

export interface Entry {
  readonly id: string;
  readonly topic: Topic;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly laws: string;
  /** Shown in a 3D view of the court. */
  readonly feature?: CourtFeature;
  /** Shown as a diagram instead. */
  readonly diagram?: "points";
}

export const ENTRIES: readonly Entry[] = [
  // The court.
  {
    id: "ends",
    topic: "court",
    title: "Service end and hazard end",
    paragraphs: [
      "The net divides the court into two ends. The server always serves from the service end, with the Dedans behind them. The receiver plays from the hazard end, with the Grille Wall behind them.",
      "Players don't swap ends after games. They change only because of chases.",
    ],
    laws: "2, 8.1(a), 8.2",
    feature: "serviceEnd",
  },
  {
    id: "net",
    topic: "court",
    title: "The net",
    paragraphs: [
      "The net sags from about 1.5 m at each side to about 0.9 m in the middle, so the lowest point to play over is the centre.",
      "A stroke that doesn't pass the net loses the rest, and so does touching the net.",
    ],
    laws: "5, 11.2(c), 11.2(h)",
    feature: "net",
  },
  {
    id: "penthouses",
    topic: "court",
    title: "The penthouses",
    paragraphs: [
      "Three sloping roofs run along the Dedans end, the Side Wall and the Grille end. They're in play: the ball can run along them and drop off unpredictably.",
      "The part of the Side Penthouse on the hazard side of the net is the Service Penthouse, which every service must touch.",
    ],
    laws: "2",
    feature: "sidePenthouse",
  },
  {
    id: "mainWall",
    topic: "court",
    title: "The Main Wall and the Tambour",
    paragraphs: [
      "The Main Wall is the long wall with no penthouse. Near the Grille end, the Tambour juts out from it at an angle and deflects the ball sharply across the court.",
      "Both are in play in a rally. A service that hits either after the Service Penthouse, before dropping, is a fault.",
    ],
    laws: "2, 8.1(d)(vii)",
    feature: "tambour",
  },
  {
    id: "outOfCourt",
    topic: "court",
    title: "Out of court",
    paragraphs: [
      "Every wall has an Out of Court line high up. The walls and penthouses below it are in play; the line itself, anything above it and the roof are out of court.",
      "A ball out of court loses the rest for its striker, and a service out of court is a fault.",
    ],
    laws: "2, 8.1(d)(vi), 11.2(d)",
    feature: "outOfCourt",
  },
  {
    id: "floorLines",
    topic: "court",
    title: "The floor lines",
    paragraphs: [
      "Lines run across the floor at both ends. At the service end they measure chases from the Dedans wall, in yards and half yards, then the gallery lines.",
      "At the hazard end the Service Line, about 6.4 m from the Grille Wall, is what matters most. The hazard chase lines are measured from it towards the net.",
    ],
    laws: "2, 6",
    feature: "chaseLines",
  },
  // Service.
  {
    id: "whoServes",
    topic: "service",
    title: "Who serves",
    paragraphs: [
      "A toss decides who starts at the service end. Whoever is at the service end serves every rest until the players change ends.",
      "The server must stand behind the Second Gallery line.",
    ],
    laws: "7.1, 8.1(a), 8.1(d)(i)",
    feature: "secondGalleryLine",
  },
  {
    id: "goodService",
    topic: "service",
    title: "A good service",
    paragraphs: [
      "The service is played up onto the Side Penthouse, or the Service Wall above it, and must touch the Service Penthouse on the hazard side of the net.",
      "It must then drop in the Service Court: beyond the Service Line, between the Fault Line and the Side Wall. A service into the Winning Gallery is good too.",
      "After the Service Penthouse it may come back off the Grille Penthouse or the wall above it.",
    ],
    laws: "8.1(d)",
    feature: "serviceCourt",
  },
  {
    id: "faults",
    topic: "service",
    title: "Faults",
    paragraphs: [
      "The server faults by standing on or past the Second Gallery line, or by missing the ball or hitting it twice.",
      "Before the Service Penthouse, the ball may touch only the Side Penthouse and the Service Wall, and not first the penthouse's edge. It must not leave the roof before reaching the Service Penthouse, or go out of court.",
      "After it, the ball mustn't hit the Main Wall or the Tambour before dropping, and must drop in the Service Court. The strip between the Fault Line and the Main Wall, once called the pass, is a fault.",
      "Two faults in a row lose the rest.",
    ],
    laws: "8.1(d)(i)–(viii), 11.2(b)",
    feature: "pass",
  },
  {
    id: "receiving",
    topic: "service",
    title: "Receiving",
    paragraphs: [
      "The receiver may play the service once it has touched the Service Penthouse, on the volley or after it bounces. Striking it before then loses the rest.",
      "A receiver who wasn't ready, and made no attempt, gets a let: the service is taken again.",
    ],
    laws: "8.1(e), 10(c)(i), 11.2(i)",
    feature: "servicePenthouse",
  },
  // Scoring.
  {
    id: "points",
    topic: "scoring",
    title: "Points and games",
    paragraphs: [
      "Points go love, fifteen, thirty, forty, game, as in lawn tennis. At forty-all it's deuce, and a player needs two points in a row from there: advantage, then game.",
      "Some events play sudden death instead: at forty-all, the next point wins.",
    ],
    laws: "12.1",
    diagram: "points",
  },
  {
    id: "sets",
    topic: "scoring",
    title: "Sets and the match",
    paragraphs: [
      "The first to six games wins the set. There's no two-game margin and no tie-break, so 6–5 is a finished set.",
      "A match is the best of one, three or five sets, as agreed before it starts.",
    ],
    laws: "13",
  },
  {
    id: "winning",
    topic: "scoring",
    title: "Winning a rest",
    paragraphs: [
      "The striker wins the rest if the ball, having passed the net, goes into the Dedans, the Grille or the Winning Gallery, or Falls on or beyond the Service Line at the hazard end.",
      "Any other Fall lays a chase instead, which is played for later.",
    ],
    laws: "11.1(b)",
    feature: "serviceLine",
  },
  {
    id: "losing",
    topic: "scoring",
    title: "Losing a rest",
    paragraphs: [
      "A player loses the rest by: a second service fault; a ball that doesn't pass the net or goes out of court; hitting the ball twice; being touched by the ball; striking it before it crosses the net; touching the net; volleying the service too soon; or a ball that comes back over the net and drops on their side.",
    ],
    laws: "11.2",
  },
  // Chases.
  {
    id: "dropAndFall",
    topic: "chases",
    title: "Drop and Fall",
    paragraphs: [
      "The Drop is the ball's first bounce after it's struck. The Fall is its second bounce, or the moment it goes into an opening.",
      "Where the ball Falls decides the rest: it wins outright, or lays a chase.",
    ],
    laws: "2",
  },
  {
    id: "chase",
    topic: "chases",
    title: "What a chase is",
    paragraphs: [
      "A ball that Falls anywhere at the service end, or in the Hazard Court short of the Service Line, isn't a point. The Marker lays a chase: names where it fell and remembers it. A ball into one of the non-winning galleries lays a chase too.",
      "The chase is played for later, after a change of ends. Laying it doesn't change the score.",
    ],
    laws: "9.2",
    feature: "chaseLines",
  },
  {
    id: "naming",
    topic: "chases",
    title: "Naming a chase",
    paragraphs: [
      'A Fall on a line takes the line\'s name, such as "Two" or "the Door". A Fall between lines is "better than" or "worse than" the nearest yard or gallery line. Better means nearer the back wall.',
      'Worse than the First Gallery is Chase the Line. At the hazard end the same names start with "Hazard", measured from the Service Line.',
    ],
    laws: "9.1, 9.2(b)",
    feature: "chaseLines",
  },
  {
    id: "hazardChases",
    topic: "chases",
    title: "Hazard chases",
    paragraphs: [
      "The server lays a hazard chase by making the ball Fall in the Hazard Court, short of the Service Line. Short of the line, it's a chase; on or beyond it, the server wins the rest.",
    ],
    laws: "9.2",
    feature: "hazardChaseLines",
  },
  {
    id: "changingEnds",
    topic: "chases",
    title: "Changing ends",
    paragraphs: [
      "The players change ends when two chases have been laid, or when one has and either player is on forty or advantage. Deuce counts as forty.",
      "This is the only way to get to the service end, so laying a chase is how the receiver wins the service.",
    ],
    laws: "8.2",
    feature: "hazardEnd",
  },
  {
    id: "playingOff",
    topic: "chases",
    title: "Playing off a chase",
    paragraphs: [
      "After the change, each chase is played for in turn, one rest each. The player who didn't lay it attacks: they must make the ball Fall better than the chase, nearer the back wall, or win the rest outright.",
      "A Fall worse than the chase loses the rest for the attacker; exactly equal is Chase off and nobody scores. The defender may let a ball go if they think it will Fall worse.",
      "Chases still waiting when a game ends are cancelled.",
    ],
    laws: "9.3",
    feature: "chaseLines",
  },
  // Openings.
  {
    id: "dedans",
    topic: "openings",
    title: "The Dedans",
    paragraphs: [
      "The big netted opening behind the service end. A ball into it wins the rest. It's the main target for the player at the hazard end.",
    ],
    laws: "2, 11.1(b)",
    feature: "opening:dedans",
  },
  {
    id: "grille",
    topic: "openings",
    title: "The Grille",
    paragraphs: [
      "A small opening in the Grille Wall, in the corner by the Main Wall. A ball into it wins the rest.",
    ],
    laws: "2, 11.1(b)",
    feature: "opening:grille",
  },
  {
    id: "winningGallery",
    topic: "openings",
    title: "The Winning Gallery",
    paragraphs: [
      "The last gallery at the hazard end, under the penthouse by the Grille Wall. A ball into it wins the rest.",
    ],
    laws: "2, 11.1(b)",
    feature: "opening:winningGallery",
  },
  {
    id: "galleries",
    topic: "openings",
    title: "The other galleries",
    paragraphs: [
      "Under the Side Penthouse each end has a row of galleries: the Line Opening, First Gallery, the Door and Second Gallery, then the Last Gallery at the service end.",
      "A ball into one of these lays a chase named after the gallery's line on the floor. A gallery's post counts as part of the gallery nearer the net.",
    ],
    laws: "2, 9.2",
    feature: "galleries",
  },
  {
    id: "entering",
    topic: "openings",
    title: "Entering an opening",
    paragraphs: [
      "A ball enters an opening when it touches the opening's post, netting or tray, or comes to rest on its ledge. Touching the inner side walls of an opening, the joues, doesn't count.",
    ],
    laws: "2",
  },
];
