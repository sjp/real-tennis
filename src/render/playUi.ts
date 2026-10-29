import { useEffect, useRef, useState } from "react";
import { toggle } from "../teach/explain.ts";
import type { ExplainStore } from "./explainStore.ts";
import { settings } from "./settings.ts";

/** The pause menu, rules and court markings, shared by the playing screens. */
export interface PlayUi {
  readonly markings: boolean;
  readonly menu: boolean;
  readonly rules: boolean;
  /** Play is held by the menu or the rules. Read by the game loop. */
  held(): boolean;
  setMenu(open: boolean): void;
  setRules(open: boolean): void;
  toggleMarkings(): void;
}

/**
 * The keys every playing screen shares: Esc pauses (or closes the rules), ?
 * the rules, M markings, X explanations, H hit assist.
 */
export function usePlayUi(explain: ExplainStore): PlayUi {
  const [markings, setMarkings] = useState(false);
  const [menu, showMenu] = useState(false);
  const [rules, showRules] = useState(false);
  const open = useRef({ menu: false, rules: false });
  const [held] = useState(() => () => open.current.menu || open.current.rules);
  const setMenu = (o: boolean) => {
    open.current.menu = o;
    showMenu(o);
  };
  const setRules = (o: boolean) => {
    open.current.rules = o;
    showRules(o);
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const o = open.current;
      if (e.code === "Escape") {
        if (o.rules) setRules(false);
        else setMenu(!o.menu);
      }
      if (e.code === "Slash") setRules(!o.rules);
      if (e.code === "KeyM") setMarkings((m) => !m);
      if (e.code === "KeyX") explain.set(toggle(explain.get()));
      if (e.code === "KeyH") settings.set({ assist: !settings.get().assist });
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [explain]);

  return {
    markings,
    menu,
    rules,
    held,
    setMenu,
    setRules,
    toggleMarkings: () => setMarkings((m) => !m),
  };
}
