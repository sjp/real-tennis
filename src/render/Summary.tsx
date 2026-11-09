import type { PlayerId } from "../rules/rally.ts";
import type { MatchState, Tally } from "../rules/match.ts";
import { summarise, type PlayerSummary, type Rest } from "../game/summary.ts";
import { centred, HIGHLIGHT } from "./view.ts";

const ROWS: readonly [string, (p: PlayerSummary) => number][] = [
  ["Rests won", (p) => p.rests],
  ["Into the Dedans", (p) => p.openings.dedans],
  ["Into the Grille", (p) => p.openings.grille],
  ["Into the Winning Gallery", (p) => p.openings.winningGallery],
  ["Chases laid", (p) => p.chasesLaid],
  ["Chases won, playing off", (p) => p.chasesWon],
  ["Service faults", (p) => p.faults],
  ["Double faults", (p) => p.doubleFaults],
];

/** The match summary (080): the result, the sets, and how the rests were won. */
export function Summary({
  match,
  rests,
  you,
  them,
  onNew,
}: {
  match: MatchState;
  rests: readonly Rest[];
  you: PlayerId;
  them: PlayerId;
  onNew: () => void;
}) {
  const s = summarise([you, them], rests);
  const pair = (t: Tally) => `${String(t[you] ?? 0)}–${String(t[them] ?? 0)}`;
  const cell = { padding: "2px 0 2px 16px", textAlign: "right" } as const;
  return (
    <div
      role="dialog"
      aria-labelledby="summary-title"
      style={{ ...centred, padding: "16px 20px", border: `1px solid ${HIGHLIGHT}` }}
    >
      <div id="summary-title" style={{ fontSize: 18, color: "#ffffff" }}>
        {match.winner === you ? "You won the match" : "Your opponent won the match"}
      </div>
      <div style={{ margin: "4px 0 10px" }}>
        {match.config.sets === 1 ? "Games " : "Sets "}
        {match.config.sets === 1 ? pair(match.setScores[0]!) : pair(match.sets)}
        {match.config.sets > 1 && ` (${match.setScores.map(pair).join(", ")})`}
      </div>
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "#888" }}>
            <td />
            <td style={cell}>You</td>
            <td style={cell}>Opponent</td>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([name, f]) => (
            <tr key={name}>
              <td>{name}</td>
              <td style={cell}>{f(s.players[you]!)}</td>
              <td style={cell}>{f(s.players[them]!)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ margin: "10px 0 12px" }}>
        Longest rest: {s.longest} {s.longest === 1 ? "stroke" : "strokes"}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button autoFocus onClick={onNew}>
          New match
        </button>
        <a href="?" style={{ color: HIGHLIGHT }}>
          Menu
        </a>
      </div>
    </div>
  );
}
