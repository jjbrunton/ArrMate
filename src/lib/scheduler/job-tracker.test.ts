import { describe, it, expect, beforeEach } from "vitest";
import {
  isJobRunning,
  isAnyJobRunning,
  getRunningJobs,
  markJobRunning,
  markJobDone,
  runExclusive,
} from "./job-tracker";

describe("job-tracker", () => {
  beforeEach(() => {
    // Clear any running jobs between tests
    for (const type of ["poll", "sync-media", "health-check", "quality-check", "sync-requests"] as const) {
      for (let id = 1; id <= 10; id++) {
        markJobDone(id, type);
      }
    }
  });

  describe("markJobRunning / markJobDone / isJobRunning", () => {
    it("tracks a running job", () => {
      expect(isJobRunning(1, "poll")).toBe(false);
      markJobRunning(1, "poll");
      expect(isJobRunning(1, "poll")).toBe(true);
      markJobDone(1, "poll");
      expect(isJobRunning(1, "poll")).toBe(false);
    });

    it("tracks jobs independently per instance", () => {
      markJobRunning(1, "poll");
      expect(isJobRunning(1, "poll")).toBe(true);
      expect(isJobRunning(2, "poll")).toBe(false);
    });

    it("tracks jobs independently per type", () => {
      markJobRunning(1, "poll");
      expect(isJobRunning(1, "poll")).toBe(true);
      expect(isJobRunning(1, "sync-media")).toBe(false);
    });
  });

  describe("isAnyJobRunning", () => {
    it("returns false when no jobs running", () => {
      expect(isAnyJobRunning(1)).toBe(false);
    });

    it("returns true when poll is running", () => {
      markJobRunning(1, "poll");
      expect(isAnyJobRunning(1)).toBe(true);
    });

    it("returns true when sync-media is running", () => {
      markJobRunning(1, "sync-media");
      expect(isAnyJobRunning(1)).toBe(true);
    });

    it("does not include jobs from other instances", () => {
      markJobRunning(2, "poll");
      expect(isAnyJobRunning(1)).toBe(false);
    });
  });

  describe("getRunningJobs", () => {
    it("returns empty array when nothing running", () => {
      expect(getRunningJobs(1)).toEqual([]);
    });

    it("returns all running job types for instance", () => {
      markJobRunning(1, "poll");
      markJobRunning(1, "quality-check");
      const running = getRunningJobs(1);
      expect(running).toHaveLength(2);
      expect(running).toContain("poll");
      expect(running).toContain("quality-check");
    });

    it("excludes jobs from other instances", () => {
      markJobRunning(1, "poll");
      markJobRunning(2, "sync-media");
      expect(getRunningJobs(1)).toEqual(["poll"]);
    });
  });

  describe("runExclusive", () => {
    it("runs the function and returns true on success", async () => {
      let ran = false;
      const result = await runExclusive(1, "poll", async () => {
        ran = true;
      });
      expect(ran).toBe(true);
      expect(result).toBe(true);
      expect(isJobRunning(1, "poll")).toBe(false);
    });

    it("skips if the same job type is already running for the instance", async () => {
      markJobRunning(1, "poll");
      let ran = false;
      const result = await runExclusive(1, "poll", async () => {
        ran = true;
      });
      expect(ran).toBe(false);
      expect(result).toBe(false);
    });

    it("allows different job types to run for the same instance", async () => {
      markJobRunning(1, "sync-media");
      let ran = false;
      const result = await runExclusive(1, "poll", async () => {
        ran = true;
      });
      expect(ran).toBe(true);
      expect(result).toBe(true);
    });

    it("cleans up on error", async () => {
      await expect(
        runExclusive(1, "poll", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      expect(isJobRunning(1, "poll")).toBe(false);
    });

    it("allows running on different instances concurrently", async () => {
      markJobRunning(1, "poll");
      let ran = false;
      const result = await runExclusive(2, "poll", async () => {
        ran = true;
      });
      expect(ran).toBe(true);
      expect(result).toBe(true);
    });
  });
});
