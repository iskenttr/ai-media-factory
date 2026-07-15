import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface VersionInfo {
  version: string;
  commit: string;
  buildDate: string;
}

export async function getVersionInfo(): Promise<VersionInfo> {
  try {
    const packagePath = resolve(__dirname, "../../../package.json");
    const content = await readFile(packagePath, "utf8");
    const packageJson = JSON.parse(content);

    return {
      version: packageJson.version || "0.0.0",
      commit: process.env.GIT_COMMIT || "unknown",
      buildDate: new Date().toISOString(),
    };
  } catch {
    return {
      version: "0.0.0",
      commit: process.env.GIT_COMMIT || "unknown",
      buildDate: new Date().toISOString(),
    };
  }
}
