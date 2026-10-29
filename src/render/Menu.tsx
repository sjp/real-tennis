import { useState } from "react";
import { reset } from "../teach/explain.ts";
import { createExplainStore } from "./explainStore.ts";
import { HIGHLIGHT, panel } from "./view.ts";

const ITEMS = [
  { href: "?learn", title: "Learn", text: "Guided lessons, one rule at a time" },
  { href: "?practice", title: "Practice", text: "On your own, with a ball machine" },
  { href: "?match", title: "Match", text: "Play against the computer" },
  { href: "?rules", title: "Rules", text: "The Laws, explained with the court" },
] as const;

/** The home menu. */
export function Menu() {
  const [cleared, setCleared] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#101418" }}>
      <div
        style={{
          ...panel,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(420px, calc(100vw - 32px))",
          boxSizing: "border-box",
          padding: "16px 20px",
        }}
      >
        <div style={{ fontSize: 22, color: "#ffffff" }}>Real tennis</div>
        <p style={{ margin: "4px 0 12px" }}>
          The original game of tennis, played indoors off walls and roofs.
        </p>
        {ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            style={{ display: "block", margin: "8px 0", color: "inherit", textDecoration: "none" }}
          >
            <span style={{ color: HIGHLIGHT, fontSize: 16 }}>{item.title}</span>
            <span style={{ color: "#888" }}> · {item.text}</span>
          </a>
        ))}
        <button
          style={{ marginTop: 12 }}
          disabled={cleared}
          onClick={() => {
            const store = createExplainStore();
            store.set(reset(store.get()));
            setCleared(true);
          }}
        >
          {cleared ? "Explanations will show again" : "Explain everything again"}
        </button>
      </div>
    </div>
  );
}
