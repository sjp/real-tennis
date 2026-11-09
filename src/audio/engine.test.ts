import { describe, expect, it } from "vitest";
import { audioUnlocker, GESTURES, type Resumable } from "./engine.ts";

/** An event target that counts its listeners. */
function fakeTarget() {
  const listeners = new Map<string, Set<unknown>>();
  return {
    listeners,
    addEventListener(type: string, l: unknown) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(l);
    },
    removeEventListener(type: string, l: unknown) {
      listeners.get(type)?.delete(l);
    },
    count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
}

/** An AudioContext that starts suspended and runs once resumed. */
function fakeContext() {
  const changes: (() => void)[] = [];
  const ctx = {
    state: "suspended",
    resumes: 0,
    resume() {
      ctx.resumes++;
      ctx.state = "running";
      return Promise.resolve();
    },
    addEventListener(_: "statechange", l: () => void) {
      changes.push(l);
    },
    /** The browser changing the state, e.g. a phone call. */
    become(state: string) {
      ctx.state = state;
      for (const l of changes) l();
    },
  };
  return ctx satisfies Resumable;
}

describe("audioUnlocker (203)", () => {
  it("listens for every unlocking gesture until sound runs, then stops", async () => {
    const target = fakeTarget();
    const ctx = fakeContext();
    const u = audioUnlocker(target, () => ctx);
    u.arm();
    expect([...target.listeners.keys()].toSorted()).toEqual([...GESTURES].toSorted());
    expect(target.count()).toBe(GESTURES.length);
    u.unlock();
    await Promise.resolve();
    expect(ctx.resumes).toBe(1);
    expect(u.armed()).toBe(false);
    expect(target.count()).toBe(0);
  });

  it("re-arms when the context is interrupted, and resumes on the next gesture", async () => {
    const target = fakeTarget();
    const ctx = fakeContext();
    const u = audioUnlocker(target, () => ctx);
    u.arm();
    u.unlock();
    await Promise.resolve();
    ctx.become("interrupted");
    expect(u.armed()).toBe(true);
    u.unlock();
    await Promise.resolve();
    expect(ctx.resumes).toBe(2);
    expect(ctx.state).toBe("running");
    expect(u.armed()).toBe(false);
  });

  it("makes the context once", () => {
    let made = 0;
    const u = audioUnlocker(fakeTarget(), () => {
      made++;
      return fakeContext();
    });
    u.unlock();
    u.unlock();
    expect(made).toBe(1);
  });

  it("stays armed where there's no Web Audio", () => {
    const u = audioUnlocker(fakeTarget(), () => null);
    u.arm();
    u.unlock();
    expect(u.armed()).toBe(true);
    expect(u.context()).toBeNull();
  });
});
