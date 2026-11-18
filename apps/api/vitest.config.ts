import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"], env: { NODE_ENV: "test", DISABLE_RATE_LIMIT: "1" }, testTimeout: 20000 } });
