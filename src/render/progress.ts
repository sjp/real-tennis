const DONE = "realTennis.lessons";

/** The ids of the lessons completed in this browser. */
export function loadDone(): readonly string[] {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(DONE) ?? "[]");
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveDone(ids: readonly string[]) {
  try {
    localStorage.setItem(DONE, JSON.stringify(ids));
  } catch {
    // Without storage, progress lasts until the page is closed.
  }
}
