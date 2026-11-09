import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import type { Mesh } from "three";
import type { Vec3 } from "../court/types.ts";
import { IDLE, type InputState } from "../input/input.ts";
import { keyboard, type Keyboard } from "../input/keyboard.ts";
import { mergeInputs, type Touch } from "../input/touch.ts";
import { STEP } from "../sim/world.ts";
import { BALL_JUMP, blendVec, STEP_FIRST, type Blend } from "./blend.ts";
import { advance } from "./stepLoop.ts";

/**
 * Steps a game at a fixed rate (210), and draws the ball between steps. It
 * owns the keyboard, merged with the touch `pad`. While `isPaused`, nothing
 * steps, and the frame that resumes is skipped, so the key that resumes isn't
 * a swing; the same when the canvas stops its frame loop. `frame` may change the input once a frame, before stepping.
 * Returns the ball's mesh.
 */
export function useStepLoop<S>({
  pad,
  isPaused,
  blend,
  get,
  step,
  ballOf,
  frame,
}: {
  pad: Touch;
  isPaused: () => boolean;
  /** Where the views draw from: the state before the latest step, and how far past it. */
  blend: Blend<S>;
  get: () => S;
  step: (input: InputState) => void;
  ballOf: (s: S) => Vec3;
  frame?: (input: InputState) => InputState;
}): RefObject<Mesh | null> {
  const ball = useRef<Mesh>(null);
  // Made in an effect, not a memo, so a discarded render leaves no listeners (202).
  const keys = useRef<Keyboard | null>(null);
  const loop = useRef({ acc: 0, paused: false });

  useEffect(() => {
    const k = keyboard();
    keys.current = k;
    return () => {
      k.dispose();
      keys.current = null;
    };
  }, []);

  // A stopped frame loop (212) is a pause the loop never sees: skip the frame that resumes too.
  const frameloop = useThree((s) => s.frameloop);
  useEffect(() => {
    if (frameloop === "never") loop.current.paused = true;
  }, [frameloop]);

  useFrame((_, delta) => {
    const l = loop.current;
    let input = mergeInputs(keys.current?.read() ?? IDLE, pad.read());
    const paused = isPaused();
    if (paused || l.paused) {
      l.paused = paused;
      l.acc = 0;
      return;
    }
    if (frame) input = frame(input);
    l.acc = advance(l.acc, delta, input, isPaused, (i) => {
      blend.stepping(get());
      step(i);
    });
    blend.at(l.acc / STEP);
    const at = blendVec(ballOf(blend.prev()), ballOf(get()), blend.t(), BALL_JUMP);
    ball.current?.position.set(at.x, at.y, at.z);
    // Before anything draws from the state this frame.
  }, STEP_FIRST);

  return ball;
}
