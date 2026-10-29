import type { TeachingEvent, TeachingId } from "../rules/teaching.ts";

/**
 * Which calls have been explained, and which are waiting (070). The first
 * time a call is made it's explained; later it's only a toast. Explanations
 * wait until the rest is over, so play is never interrupted mid-rest.
 */
export interface Explainer {
  readonly on: boolean;
  readonly seen: readonly TeachingId[];
  readonly pending: readonly TeachingId[];
  readonly showing: TeachingId | null;
}

export function explainer(seen: readonly TeachingId[] = [], on = true): Explainer {
  return { on, seen, pending: [], showing: null };
}

/** Queues the calls not explained yet. */
export function heard(e: Explainer, calls: readonly TeachingEvent[]): Explainer {
  if (!e.on) return e;
  const fresh = calls
    .map((c) => c.id)
    .filter((id, i, all) => all.indexOf(id) === i)
    .filter((id) => !e.seen.includes(id) && !e.pending.includes(id) && e.showing !== id);
  return fresh.length === 0 ? e : { ...e, pending: [...e.pending, ...fresh] };
}

/** Shows the next waiting explanation, if the rest is over and none is showing. */
export function advance(e: Explainer, quiet: boolean): Explainer {
  if (!e.on || !quiet || e.showing !== null || e.pending.length === 0) return e;
  const [showing, ...pending] = e.pending;
  return { ...e, showing: showing!, pending, seen: [...e.seen, showing!] };
}

export function dismiss(e: Explainer): Explainer {
  return { ...e, showing: null };
}

/** Switching off drops anything waiting; switching on starts from now. */
export function toggle(e: Explainer): Explainer {
  return { ...e, on: !e.on, pending: [], showing: null };
}

/** Forgets what has been explained, so everything is explained again. */
export function reset(e: Explainer): Explainer {
  return { ...e, seen: [], pending: [] };
}
