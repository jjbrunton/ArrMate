import { afterEach, describe, expect, it } from "vitest";
import packageJson from "../../../package.json";
import { getAppVersionInfo } from "./version";

const ORIGINAL_APP_VERSION = process.env.APP_VERSION;
const ORIGINAL_APP_COMMIT_SHA = process.env.APP_COMMIT_SHA;
const ORIGINAL_APP_RELEASE_REPOSITORY = process.env.APP_RELEASE_REPOSITORY;

describe("version", () => {
  afterEach(() => {
    if (ORIGINAL_APP_VERSION === undefined) {
      delete process.env.APP_VERSION;
    } else {
      process.env.APP_VERSION = ORIGINAL_APP_VERSION;
    }

    if (ORIGINAL_APP_COMMIT_SHA === undefined) {
      delete process.env.APP_COMMIT_SHA;
    } else {
      process.env.APP_COMMIT_SHA = ORIGINAL_APP_COMMIT_SHA;
    }

    if (ORIGINAL_APP_RELEASE_REPOSITORY === undefined) {
      delete process.env.APP_RELEASE_REPOSITORY;
    } else {
      process.env.APP_RELEASE_REPOSITORY = ORIGINAL_APP_RELEASE_REPOSITORY;
    }
  });

  it("falls back to the package version and default repository", () => {
    delete process.env.APP_VERSION;
    delete process.env.APP_COMMIT_SHA;
    delete process.env.APP_RELEASE_REPOSITORY;

    expect(getAppVersionInfo()).toEqual({
      currentVersion: packageJson.version,
      currentCommitSha: null,
      releaseRepository: "jjbrunton/ArrMate",
    });
  });

  it("uses build metadata from the environment when present", () => {
    process.env.APP_VERSION = "1.2.3";
    process.env.APP_COMMIT_SHA = "abcdef123456";
    process.env.APP_RELEASE_REPOSITORY = "example/ArrMate";

    expect(getAppVersionInfo()).toEqual({
      currentVersion: "1.2.3",
      currentCommitSha: "abcdef123456",
      releaseRepository: "example/ArrMate",
    });
  });
});
