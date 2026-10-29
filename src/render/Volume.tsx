import { settings, useSettings } from "./settings.ts";

/** The master volume slider. */
export function Volume() {
  const { volume } = useSettings();
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
      Volume
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => settings.set({ volume: Number(e.target.value) })}
      />
      {volume === 0 ? "off" : `${Math.round(volume * 100)}%`}
    </label>
  );
}
