import { describe, expect, it } from "vitest";
import {
  MeasureOptionsError,
  PACKAGE_NAME,
  SCHEMA_VERSION,
  defineConfig,
  definePlugin,
  defineScenario,
  measure,
} from "./index.js";

describe("@ohmyperf/core surface", () => {
  it("exports stable identity constants", () => {
    expect(PACKAGE_NAME).toBe("@ohmyperf/core");
    expect(SCHEMA_VERSION).toBe("1.0.0");
  });

  it("defineScenario returns its argument unchanged", () => {
    const s = defineScenario({ name: "x", steps: [] });
    expect(s.name).toBe("x");
    expect(s.steps).toEqual([]);
  });

  it("definePlugin enforces apiVersion through TypeScript", () => {
    const p = definePlugin({ id: "test", version: "1.0.0", apiVersion: "1" });
    expect(p.id).toBe("test");
  });

  it("defineConfig is identity", () => {
    const cfg = defineConfig({ runs: 5 });
    expect(cfg.runs).toBe(5);
  });

  describe("measure() input validation", () => {
    it("rejects non-object opts", async () => {
      // @ts-expect-error testing runtime guard
      await expect(measure(null)).rejects.toBeInstanceOf(MeasureOptionsError);
    });

    it("rejects non-http URLs", async () => {
      await expect(measure({ url: "not-a-url" })).rejects.toMatchObject({
        name: "MeasureOptionsError",
        field: "url",
      });
      await expect(measure({ url: "ftp://example.com/" })).rejects.toMatchObject({
        field: "url",
      });
    });

    it("rejects non-positive integer runs", async () => {
      await expect(
        measure({ url: "https://example.com/", runs: 0 }),
      ).rejects.toMatchObject({ field: "runs" });
      await expect(
        measure({ url: "https://example.com/", runs: 1.5 }),
      ).rejects.toMatchObject({ field: "runs" });
    });

    it("throws not-yet-implemented for valid options (P0 placeholder)", async () => {
      await expect(measure({ url: "https://example.com/" })).rejects.toThrow(
        /not yet implemented/i,
      );
    });
  });
});
