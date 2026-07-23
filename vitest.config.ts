import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Local model source trees and generated git worktrees are runtime tooling,
    // not additional copies of the application test suite.
    exclude: [...configDefaults.exclude, "work/**", "worktrees/**"],
  },
});
