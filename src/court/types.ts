// Court geometry, in metres. The origin is on the floor at the centre of the
// net. x runs across the court (Main Wall at -x, Side Wall at +x), y is up,
// and z runs along the court (Dedans wall at -z, Grille Wall at +z).

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FloorPoint {
  readonly x: number;
  readonly z: number;
}

export type Side = "service" | "hazard";

/**
 * Where a chase is marked. `distance` is from the Dedans wall on the service
 * side, and from the Service Line towards the net on the hazard side.
 */
export interface ChaseMark {
  readonly side: Side;
  readonly distance: number;
}

export type OpeningId =
  | "dedans"
  | "grille"
  | "lineOpening"
  | "firstGallery"
  | "door"
  | "secondGallery"
  | "lastGallery"
  | "hazardLineOpening"
  | "hazardFirstGallery"
  | "hazardDoor"
  | "hazardSecondGallery"
  | "winningGallery";

export type ChaseLineId =
  | "halfAYard"
  | "oneYard"
  | "oneAndTwo"
  | "two"
  | "twoAndThree"
  | "three"
  | "threeAndFour"
  | "four"
  | "fourAndFive"
  | "five"
  | "fiveAndSix"
  | "six"
  | "halfAYardWorseThanSix"
  | "lastGallery"
  | "halfAYardWorseThanLastGallery"
  | "aYardWorseThanLastGallery"
  | "secondGallery"
  | "door"
  | "firstGallery"
  | "hazardHalfAYard"
  | "hazardOneYard"
  | "hazardOneAndTwo"
  | "hazardTwoYards"
  | "hazardSecondGallery"
  | "hazardDoor"
  | "hazardFirstGallery";

/**
 * A chase line (Law 6). `distance` is measured from the Dedans wall on the
 * service side, and from the Service Line towards the net on the hazard side.
 * Law 9.2(b) names a Fall between lines after the nearest yard or gallery
 * line, so half-yard lines only name a Fall on the line itself.
 */
export interface ChaseLine {
  readonly id: ChaseLineId;
  readonly name: string;
  readonly side: Side;
  readonly kind: "yard" | "halfYard" | "gallery";
  readonly distance: number;
}

/** The Main Wall, the Side Wall (under the Side Penthouse) and the back walls. */
export type WallId = "main" | "side" | "dedans" | "grille";

/**
 * A rectangle in a wall's plane. `u` runs along the wall: z for the Side
 * Wall, x for the back walls.
 */
export interface WallRect {
  readonly u0: number;
  readonly u1: number;
  readonly y0: number;
  readonly y1: number;
}

export type OpeningOutcome =
  | { readonly kind: "win" }
  | { readonly kind: "chase"; readonly line: ChaseLineId | "chaseTheLine" | "hazardChaseTheLine" };

export interface Opening {
  readonly id: OpeningId;
  readonly name: string;
  readonly wall: WallId;
  readonly side: Side;
  readonly outcome: OpeningOutcome;
  /** The opening itself, excluding its post. */
  readonly rect: WallRect;
  /** The post on the far side from the net. It belongs to this gallery (Law 2). */
  readonly post?: WallRect;
  /**
   * Inner side walls at either end of the opening. Touching a joue doesn't
   * count as entering. The ball has entered once it's `depth` behind the wall.
   */
  readonly joues: readonly ("u0" | "u1")[];
  readonly depth: number;
}

/**
 * The three penthouses share their heights, so the roofs meet in straight
 * hips at the corners.
 */
export interface Penthouses {
  /** Height of the lower (court-side) edge, i.e. the top of the bandeau. */
  readonly edgeHeight: number;
  /** Height where the roof meets the outer wall. */
  readonly wallHeight: number;
  /** Height of the bandeau, the strip of wall immediately below a penthouse. */
  readonly bandeauHeight: number;
  /** Horizontal depth of each roof, from its edge to the outer wall. */
  readonly depth: { readonly dedans: number; readonly side: number; readonly grille: number };
}

export interface CourtDefinition {
  readonly name: string;
  readonly floor: { readonly length: number; readonly width: number };
  /** Height of the walls and the ceiling. */
  readonly height: number;
  /** Height of the Out of Court Line on each wall. */
  readonly outOfCourtHeight: {
    readonly main: number;
    readonly service: number;
    readonly dedans: number;
    readonly grille: number;
  };
  readonly penthouses: Penthouses;
  readonly net: {
    readonly centreHeight: number;
    readonly endHeight: number;
    /** Width of the Net Post in the Side Wall, centred on the net. */
    readonly postWidth: number;
  };
  readonly tambour: {
    /** Distance from the Grille Wall to the tambour's edge, where its angled face ends. */
    readonly edge: number;
    /** How far the tambour projects from the Main Wall. */
    readonly projection: number;
    /** Angle of the face to the Main Wall, in degrees. */
    readonly angle: number;
  };
  /** Distance of the Service Line from the Grille Wall. */
  readonly serviceLine: number;
  /** Distance of the Fault Line from the Side Wall (the Service Court's width). */
  readonly faultLine: number;
  readonly lineWidth: number;
  readonly openings: readonly Opening[];
  readonly chaseLines: readonly ChaseLine[];
}
