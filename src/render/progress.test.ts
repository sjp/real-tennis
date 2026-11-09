import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDone, saveDone } from "./progress.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const stored = (raw: string | null) => {
  vi.stubGlobal("localStorage", { getItem: () => raw, setItem: () => {} });
};

describe("lesson progress", () => {
  it("round-trips the completed ids", () => {
    const m = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => m.set(k, v),
    });
    saveDone(["serve", "chase"]);
    expect(loadDone()).toEqual(["serve", "chase"]);
  });

  it("drops bad JSON, non-array data and non-string ids", () => {
    stored(null);
    expect(loadDone()).toEqual([]);
    stored("[");
    expect(loadDone()).toEqual([]);
    stored('{"0":"serve"}');
    expect(loadDone()).toEqual([]);
    stored('["serve", 2, null]');
    expect(loadDone()).toEqual(["serve"]);
  });

  it("copes with storage that throws or is missing", () => {
    const boom = () => {
      throw new Error("denied");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom });
    expect(loadDone()).toEqual([]);
    expect(() => {
      saveDone(["serve"]);
    }).not.toThrow();
    vi.stubGlobal("localStorage", undefined);
    expect(loadDone()).toEqual([]);
  });
});
