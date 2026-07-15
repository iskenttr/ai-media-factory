import { describe, it, expect } from "vitest";
import { getVersionInfo } from "./version";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("version service", () => {
  describe("getVersionInfo", () => {
    it("returns version info object", async () => {
      const info = await getVersionInfo();

      expect(info).toHaveProperty("version");
      expect(info).toHaveProperty("commit");
      expect(info).toHaveProperty("buildDate");
    });

    it("version matches package.json version", async () => {
      const info = await getVersionInfo();
      const packagePath = resolve(__dirname, "../../../package.json");
      const content = await readFile(packagePath, "utf8");
      const packageJson = JSON.parse(content);

      expect(info.version).toBe(packageJson.version);
    });

    it("buildDate is valid ISO string", async () => {
      const info = await getVersionInfo();
      const date = new Date(info.buildDate);

      expect(date.getTime()).not.toBeNaN();
    });

    it("commit defaults to unknown when env not set", async () => {
      const originalCommit = process.env.GIT_COMMIT;
      delete process.env.GIT_COMMIT;

      const info = await getVersionInfo();

      expect(info.commit).toBe("unknown");

      if (originalCommit) {
        process.env.GIT_COMMIT = originalCommit;
      }
    });
  });
});
