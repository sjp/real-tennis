import { useEffect, useRef, useState } from "react";
import { withModifier } from "../input/keyboard.ts";
import { toggle } from "../teach/explain.ts";
import type { ExplainStore } from "./explainStore.ts";
import { settings } from "./settings.ts";

/** The pause menu, rules and court markings, shared by the playing screens. */
export interface PlayUi {
  readonly markings: boolean;
  readonly menu: boolean;
  readonly rules: boolean;
  /** Play is held by the menu or the rules. Read by the game loop. */
  readonly held: () => boolean;
  readonly setMenu: (open: boolean) => void;
  readonly setRules: (open: boolean) => void;
  readonly toggleMarkings: () => void;
}

/** What a key does on a playing screen. */
export type PlayKey = "menu" | "closeRules" | "rules" | "markings" | "explain" | "assist";

/**
 * The action for a key press: Esc closes the rules if open, else toggles the
 * pause menu. A held key or a browser shortcut (Ctrl, Cmd or Alt) does nothing.
 */
export function playKey(
  e: {
    readonly code: string;
    readonly repeat: boolean;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly altKey: boolean;
  },
  rulesOpen: boolean,
): PlayKey | null {
  if (e.repeat || withModifier(e)) return null;
  switch (e.code) {
    case "Escape":
      return rulesOpen ? "closeRules" : "menu";
    case "Slash":
      return "rules";
    case "KeyM":
      return "markings";
    case "KeyX":
      return "explain";
    case "KeyH":
      return "assist";
    default:
      return null;
  }
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
      const o = open.current;
      switch (playKey(e, o.rules)) {
        case "closeRules":
          setRules(false);
          break;
        case "menu":
          setMenu(!o.menu);
          break;
        case "rules":
          setRules(!o.rules);
          break;
        case "markings":
          setMarkings((m) => !m);
          break;
        case "explain":
          explain.set(toggle(explain.get()));
          break;
        case "assist":
          settings.set({ assist: !settings.get().assist });
          break;
        case null:
      }
    };
    window.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("keydown", down);
    };
  }, [explain]);

  return {
    markings,
    menu,
    rules,
    held,
    setMenu,
    setRules,
    toggleMarkings: () => {
      setMarkings((m) => !m);
    },
  };
}
