import { describe, expect, it } from "vitest";
import { getInstanceDefinition, isArrInstanceType } from "./definitions";

describe("instance definitions", () => {
  it("marks Sonarr and Radarr as Arr instance types", () => {
    expect(isArrInstanceType("sonarr")).toBe(true);
    expect(isArrInstanceType("radarr")).toBe(true);
    expect(isArrInstanceType("overseerr")).toBe(false);
  });

  it("describes Overseerr capabilities", () => {
    const definition = getInstanceDefinition("overseerr");

    expect(definition.label).toBe("Overseerr");
    expect(definition.supportsQueue).toBe(false);
    expect(definition.supportsRequestSync).toBe(true);
    expect(definition.supportsAutoFix).toBe(false);
  });
});

