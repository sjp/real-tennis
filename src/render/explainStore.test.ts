import { afterEach, describe, expect, it, vi } from "vitest";
import { teach } from "../rules/teaching.ts";
import { dismiss, toggle } from "../teach/explain.ts";
import { createExplainStore, explainCalls, focusOf } from "./explainStore.ts";

/** A Map-backed localStorage, counting writes. */
function fakeStorage(items: Record<string, string> = {}) {
  const m = new Map(Object.entries(items));
  const s = {
    writes: 0,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      s.writes++;
      m.set(k, v);
    },
    items: m,
  };
  vi.stubGlobal("localStorage", s);
  return s;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createExplainStore", () => {
  it("loads only real teaching ids, not prototype keys from tampered storage", () => {
    fakeStorage({
      "realTennis.explained": JSON.stringify(["faultLine", "constructor", "toString", 3, "nope"]),
    });
    expect(createExplainStore().get()).toMatchObject({ seen: ["faultLine"], on: true });
  });

  it("starts afresh from bad JSON, non-array data or missing storage", () => {
    fakeStorage({ "realTennis.explained": "{" });
    expect(createExplainStore().get().seen).toEqual([]);
    fakeStorage({ "realTennis.explained": '{"faultLine":1}', "realTennis.explanations": "off" });
    expect(createExplainStore().get()).toMatchObject({ seen: [], on: false });
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", undefined);
    expect(createExplainStore().get()).toMatchObject({ seen: [], on: true });
  });

  it("persists only when what's seen or the switch changes, and always notifies", () => {
    const s = fakeStorage();
    const store = createExplainStore();
    const heard = vi.fn<() => void>();
    const off = store.subscribe(heard);

    store.set(store.get());
    expect(heard).not.toHaveBeenCalled();

    explainCalls(store, [teach("faultLine")], true);
    expect(store.get().showing).toBe("faultLine");
    expect(s.writes).toBe(2);
    expect(JSON.parse(s.items.get("realTennis.explained")!)).toEqual(["faultLine"]);

    store.set(dismiss(store.get()));
    expect(s.writes).toBe(2);
    expect(heard).toHaveBeenCalledTimes(2);

    store.set(toggle(store.get()));
    expect(s.items.get("realTennis.explanations")).toBe("off");

    off();
    store.set(toggle(store.get()));
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it("keeps going when storage throws on write", () => {
    fakeStorage().setItem = () => {
      throw new Error("quota");
    };
    const store = createExplainStore();
    explainCalls(store, [teach("faultLine")], true);
    expect(store.get().seen).toEqual(["faultLine"]);
  });
});

describe("focusOf", () => {
  it("looks at the court feature a call is about, and nowhere otherwise", () => {
    fakeStorage();
    const store = createExplainStore();
    expect(focusOf(store)).toBeNull();
    explainCalls(store, [teach("faultLine")], true);
    const f = focusOf(store);
    expect(Number.isFinite(f?.x) && Number.isFinite(f?.z)).toBe(true);
  });
});
