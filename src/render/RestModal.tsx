import { useEffect, useRef } from "react";
import type { RestResult } from "../game/result.ts";
import { callScore, type Labels } from "../rules/score.ts";
import { useDismissKeys } from "./dismissKeys.ts";
import { Scoreboard, type Side } from "./Scoreboard.tsx";
import { panel } from "./view.ts";

/** How long it shows, with play frozen, unless dismissed. */
const SHOW_MS = 5000;

/**
 * Who won the rest and the score after it (160), over the court. It closes
 * after `SHOW_MS`, or sooner on a tap, click or Space.
 */
export function RestModal({
  result,
  sides,
  onDismiss,
}: {
  result: RestResult;
  sides: readonly [Side, Side];
  onDismiss: () => void;
}) {
  const ready = useDismissKeys(onDismiss, result);
  useEffect(() => {
    const timer = setTimeout(onDismiss, SHOW_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [result, onDismiss]);
  // No buttons: focus the dialog, so a screen reader reads it (213).
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
  }, [result]);
  const close = () => {
    if (ready()) onDismiss();
  };

  const labels: Labels = Object.fromEntries(sides.map((s) => [s.id, s.label]));
  const winner = sides.find((s) => s.id === result.winner);
  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={result.title}
      tabIndex={-1}
      onPointerDown={close}
      style={{ position: "fixed", inset: 0, zIndex: 20, touchAction: "none", outline: "none" }}
    >
      <div
        style={{
          ...panel,
          left: "50%",
          top: "38%",
          transform: "translate(-50%, -50%)",
          width: "max-content",
          maxWidth: "min(420px, calc(100vw - 32px))",
          boxSizing: "border-box",
          padding: "14px 20px",
          textAlign: "center",
          background: "rgba(0, 0, 0, 0.45)",
          border: `2px solid ${winner?.color ?? "#888"}`,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: "bold", color: winner?.color ?? "#ffffff" }}>
          {result.title}
        </div>
        <div style={{ margin: "4px 0 10px" }}>{result.why}</div>
        {result.note && <div style={{ color: "#b8b8b8", marginBottom: 10 }}>{result.note}</div>}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Scoreboard match={result.match} sides={sides} />
        </div>
        <div style={{ color: "#ffd166", marginTop: 8 }}>{callScore(result.match, labels)}</div>
      </div>
    </div>
  );
}
