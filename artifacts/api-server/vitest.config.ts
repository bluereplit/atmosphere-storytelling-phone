import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // Allow TypeScript files to be found when importing with .js extensions
    // (standard ESM + TypeScript convention).
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
});
