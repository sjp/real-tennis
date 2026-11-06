import type { ChaseCall } from "../court/chase.ts";
import { markZ, type CourtFeature } from "../court/features.ts";
import { standardCourt as court } from "../court/standard.ts";
import { Highlight, Label } from "./teach.tsx";

const hw = court.floor.width / 2;
const hl = court.floor.length / 2;

const WINNING = "#ffd166";
const GALLERY = "#4cc9f0";
const AREA = "#90e0a0";
const CHASE = "#f28482";

const FEATURES: readonly { feature: CourtFeature; colour: string }[] = [
  { feature: "opening:dedans", colour: WINNING },
  { feature: "opening:grille", colour: WINNING },
  { feature: "opening:winningGallery", colour: WINNING },
  ...court.openings
    .filter((o) => o.outcome.kind === "chase")
    .map((o) => ({ feature: `opening:${o.id}` as const, colour: GALLERY })),
  { feature: "serviceCourt", colour: AREA },
  { feature: "pass", colour: CHASE },
  { feature: "tambour", colour: GALLERY },
  { feature: "servicePenthouse", colour: AREA },
  { feature: "serviceLine", colour: WINNING },
  { feature: "secondGalleryLine", colour: GALLERY },
];

/**
 * The court markings overlay (070): openings, the Service Court and the pass,
 * the tambour, and every chase line with its name and distance.
 */
export function Markings() {
  return (
    <group>
      {FEATURES.map(({ feature, colour }) => (
        <Highlight key={feature} feature={feature} colour={colour} pulse={false} />
      ))}
      <Label text="Service end" position={[0, 2.5, -hl / 2]} colour={AREA} size={0.045} />
      <Label text="Hazard end" position={[0, 2.5, hl / 2]} colour={AREA} size={0.045} />
      {court.chaseLines
        .filter((l) => l.kind !== "halfYard")
        .map((l) => (
          <Label
            key={l.id}
            text={`${l.name} · ${l.distance.toFixed(2)} m`}
            position={[-hw + 1.6, 0.25, markZ(court, l)]}
            colour={CHASE}
            size={0.028}
          />
        ))}
    </group>
  );
}

/** Chases waiting to be played for, marked where they fell. */
export function ChaseMarkers({ chases }: { chases: readonly ChaseCall[] }) {
  return (
    <group>
      {chases.map((c, i) => {
        const z = markZ(court, c.mark);
        return (
          <group key={i}>
            <mesh position={[0, 0.006, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[court.floor.width, 0.08]} />
              <meshBasicMaterial color={CHASE} />
            </mesh>
            <Label
              text={`Chase ${String(i + 1)}: ${c.name}`}
              position={[hw - 2.5, 0.4, z]}
              colour={CHASE}
              size={0.035}
            />
          </group>
        );
      })}
    </group>
  );
}
