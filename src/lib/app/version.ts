import packageJson from "../../../package.json";

const DEFAULT_RELEASE_REPOSITORY = "jjbrunton/ArrMate";

export interface AppVersionInfo {
  currentVersion: string;
  currentCommitSha: string | null;
  releaseRepository: string;
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getAppVersionInfo(): AppVersionInfo {
  return {
    currentVersion: readEnv("APP_VERSION") ?? packageJson.version,
    currentCommitSha: readEnv("APP_COMMIT_SHA"),
    releaseRepository: readEnv("APP_RELEASE_REPOSITORY") ?? DEFAULT_RELEASE_REPOSITORY,
  };
}
