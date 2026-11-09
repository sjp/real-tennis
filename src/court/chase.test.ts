import { describe, expect, it } from "vitest";
import { chaseLabel, chaseName, ON_LINE_TOLERANCE } from "./chase.ts";
import { yards } from "./units.ts";
import { standardCourt as court } from "./standard.ts";

const service = (distance: number) => chaseName(court, { side: "service", distance }).name;
const hazard = (distance: number) => chaseName(court, { side: "hazard", distance }).name;
const line = (id: string) => court.chaseLines.find((l) => l.id === id)!.distance;

describe("chaseName", () => {
  it("names a Fall on a line after that line (Law 9.2(b))", () => {
    expect(service(yards(2))).toBe("Two");
    expect(service(yards(2.5) + 0.03)).toBe("Two and Three");
    expect(service(line("door"))).toBe("the Door");
    expect(hazard(yards(2))).toBe("Hazard Two Yards");
  });

  it("counts a Fall exactly the tolerance from a line as on it", () => {
    const two = line("two");
    for (const d of [two - 0.1, two + 0.1]) {
      const tolerance = Math.abs(two - d);
      const name = (t: number) => chaseName(court, { side: "service", distance: d }, t).name;
      expect(name(tolerance)).toBe("Two");
      expect(name(tolerance * (1 - 1e-9))).toBe(d < two ? "Better than Two" : "Worse than Two");
    }
    expect(service(two + ON_LINE_TOLERANCE * 0.99)).toBe("Two");
    expect(service(two + ON_LINE_TOLERANCE * 1.01)).toBe("Worse than Two");
  });

  it("names a Fall nearer the Dedans wall than Two as better than Two (Law 9.1)", () => {
    expect(service(yards(2) - 0.15)).toBe("Better than Two");
  });

  it("names a Fall nearer the net than Two as worse than Two (Law 9.1)", () => {
    expect(service(yards(2) + 0.15)).toBe("Worse than Two");
  });

  it("names between-line Falls after the nearest yard or gallery line, not half-yard lines (Law 9.2(b))", () => {
    // Just worse than One and Two, which is nearer Two than One Yard.
    expect(service(yards(1.5) + 0.1)).toBe("Better than Two");
    // Just better than One and Two, nearer One Yard.
    expect(service(yards(1.5) - 0.1)).toBe("Worse than One Yard");
  });

  it("names a Fall better than the first line Better than Half-a-Yard (Law 9.2(b)(i))", () => {
    expect(service(0.2)).toBe("Better than Half-a-Yard");
    expect(hazard(0.2)).toBe("Better than Hazard Half-a-Yard");
  });

  it("uses Nearly and More than a Yard Worse than the Last Gallery (Law 9.2(b)(ii))", () => {
    const yardWorse = line("aYardWorseThanLastGallery");
    expect(service(yardWorse - 0.15)).toBe("Nearly a Yard Worse than the Last Gallery");
    expect(service(yardWorse + 0.15)).toBe("More than a Yard Worse than the Last Gallery");
    expect(service(yardWorse)).toBe("A Yard Worse than the Last Gallery");
  });

  it("names a Fall worse than the First Gallery line Chase the Line (Law 9.2(b)(iii))", () => {
    expect(service(line("firstGallery") + 0.3)).toBe("Chase the Line");
    expect(hazard(line("hazardFirstGallery") + 0.3)).toBe("Hazard Chase the Line");
  });

  it("names gallery-line chases on the hazard side", () => {
    expect(hazard(line("hazardDoor") - 0.2)).toBe("Better than Hazard the Door");
  });
});

describe("chaseLabel", () => {
  it("shows the metric distance alongside the name", () => {
    expect(chaseLabel(chaseName(court, { side: "service", distance: 1.6 }))).toBe(
      "Better than Two (1.60 m)",
    );
    expect(chaseLabel(chaseName(court, { side: "hazard", distance: 0.2 }))).toBe(
      "Better than Hazard Half-a-Yard (0.20 m from the Service Line)",
    );
  });
});
