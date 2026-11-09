// @vitest-environment happy-dom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GRACE_MS, useDismissKeys } from "./dismissKeys.ts";

/** The test's clock, read through `performance.now`. */
let now = 1000;
let root: Root;
/** What the panel hands the test: the hook's `ready`, and a way to re-render it. */
const panel = { ready: () => false, rerender: () => {} };
const closed = vi.fn<() => void>();

/** A panel whose parent passes a new inline `onClose` on every render. */
function Panel({ opening }: { opening: unknown }) {
  const [, setN] = useState(0);
  const ready = useDismissKeys(() => {
    closed();
  }, opening);
  useEffect(() => {
    panel.ready = ready;
    panel.rerender = () => {
      setN((n) => n + 1);
    };
  });
  return null;
}

function open(opening: unknown = "first") {
  act(() => {
    root.render(<Panel opening={opening} />);
  });
}

function press(code: string, repeat = false): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { code, repeat, cancelable: true });
  act(() => {
    window.dispatchEvent(e);
  });
  return e;
}

const reactAct = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeAll(() => {
  reactAct.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete reactAct.IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  closed.mockReset();
  vi.restoreAllMocks();
});

describe("useDismissKeys (201)", () => {
  it("swallows Space pressed as the panel opens, and closes on Space after the grace", () => {
    open();
    const early = press("Space");
    expect(early.defaultPrevented).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    expect(panel.ready()).toBe(false);

    now += GRACE_MS;
    expect(panel.ready()).toBe(true);
    const late = press("Space");
    expect(late.defaultPrevented).toBe(true);
    expect(closed).toHaveBeenCalledTimes(1);
    press("Enter");
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it("leaves it open for a held key, and leaves other keys alone", () => {
    open();
    now += GRACE_MS * 2;
    expect(press("Space", true).defaultPrevented).toBe(false);
    expect(press("KeyW").defaultPrevented).toBe(false);
    expect(closed).not.toHaveBeenCalled();
  });

  it("doesn't restart the grace when the parent re-renders with a new onClose", () => {
    open();
    now += GRACE_MS - 50;
    act(() => {
      panel.rerender();
    });
    open();
    now += 50;
    press("Space");
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("restarts the grace when a new panel opens", () => {
    open("first");
    now += GRACE_MS;
    open("second");
    press("Space");
    expect(closed).not.toHaveBeenCalled();
    now += GRACE_MS;
    press("Space");
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("stops listening once closed", () => {
    open();
    act(() => {
      root.unmount();
    });
    now += GRACE_MS;
    press("Space");
    expect(closed).not.toHaveBeenCalled();
    root = createRoot(document.createElement("div"));
  });
});
