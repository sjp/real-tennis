import { standardCourt as court } from "../court/standard.ts";
import { createWorld } from "../sim/world.ts";

/** The one physics world the playing screens share. */
export const world = createWorld(court);
