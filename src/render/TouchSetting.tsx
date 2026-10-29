import { settings, useSettings, type TouchMode } from "./settings.ts";

const MODES: readonly [TouchMode, string][] = [
  ["auto", "After a touch"],
  ["on", "Always"],
  ["off", "Never"],
];

/** When the touch controls show. */
export function TouchSetting() {
  const { touch } = useSettings();
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
      Touch controls
      <select value={touch} onChange={(e) => settings.set({ touch: e.target.value as TouchMode })}>
        {MODES.map(([mode, name]) => (
          <option key={mode} value={mode}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
