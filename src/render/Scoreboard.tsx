import type { MatchState } from "../rules/match.ts";
import type { PlayerId } from "../rules/rally.ts";
import { pointsShown } from "../rules/score.ts";

export interface Side {
  readonly id: PlayerId;
  readonly label: string;
  /** The row's text colour. */
  readonly color: string;
}

interface Column {
  readonly name: string;
  readonly shown: (p: PlayerId) => number | string;
  /** For bolding the leader. */
  readonly rank: (p: PlayerId) => number;
}

const RANK: Readonly<Record<string, number>> = { "0": 0, "15": 1, "30": 2, "40": 3, Adv: 4 };

/**
 * The score as a two-row board (161): one row per player in a fixed order,
 * with a dot for the server and the leader's number bold in each column.
 */
export function Scoreboard({ match, sides }: { match: MatchState; sides: readonly [Side, Side] }) {
  const [a, b] = sides;
  const games = (p: PlayerId) => match.games[p] ?? 0;
  const sets = (p: PlayerId) => match.sets[p] ?? 0;
  const points = (p: PlayerId) => pointsShown(match, p);
  const columns: readonly Column[] = [
    ...(match.config.sets > 1 ? [{ name: "Sets", shown: sets, rank: sets }] : []),
    { name: "Games", shown: games, rank: games },
    { name: "Points", shown: points, rank: (p) => RANK[points(p)]! },
  ];
  const cell = { padding: "0 0 0 14px", textAlign: "right", minWidth: 28 } as const;
  return (
    <table style={{ borderCollapse: "collapse", font: "inherit" }}>
      <thead>
        <tr style={{ color: "#999", fontSize: 11 }}>
          <th />
          {columns.map(({ name }) => (
            <th key={name} style={{ ...cell, fontWeight: "normal" }}>
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sides.map((s) => {
          const other = s === a ? b : a;
          return (
            <tr key={s.id} style={{ color: s.color, fontSize: 15 }}>
              <td style={{ whiteSpace: "nowrap" }}>
                <span
                  aria-label={match.server === s.id ? "serving" : undefined}
                  style={{ display: "inline-block", width: 20, color: "#ffd166" }}
                >
                  {match.server === s.id ? "●" : ""}
                </span>
                {s.label}
              </td>
              {columns.map(({ name, shown, rank }) => (
                <td
                  key={name}
                  style={{
                    ...cell,
                    fontWeight: rank(s.id) > rank(other.id) ? "bold" : "normal",
                  }}
                >
                  {shown(s.id)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
