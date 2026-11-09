import type { MatchState } from "../rules/match.ts";
import type { PlayerId } from "../rules/rally.ts";
import { leads, scoreColumns } from "./scoreColumns.ts";
import { srOnly } from "./view.ts";

export interface Side {
  readonly id: PlayerId;
  readonly label: string;
  /** The row's text colour. */
  readonly color: string;
}

/**
 * The score as a two-row board (161): one row per player in a fixed order,
 * with a dot for the server and the leader's number bold in each column.
 */
export function Scoreboard({ match, sides }: { match: MatchState; sides: readonly [Side, Side] }) {
  const [a, b] = sides;
  const columns = scoreColumns(match);
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
                {/* The dot is for the eye; a screen reader hears "(serving)" (213). */}
                <span aria-hidden style={{ display: "inline-block", width: 20, color: "#ffd166" }}>
                  {match.server === s.id ? "●" : ""}
                </span>
                {s.label}
                {match.server === s.id && <span style={srOnly}> (serving)</span>}
              </td>
              {columns.map((c) => (
                <td
                  key={c.name}
                  style={{ ...cell, fontWeight: leads(c, s.id, other.id) ? "bold" : "normal" }}
                >
                  {c.shown(s.id)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
