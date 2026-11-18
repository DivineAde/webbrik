import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Loads a .env file (from the working directory, then the repo root) without overriding variables that are already set. */
for (const dir of [process.cwd(), resolve(process.cwd(), "../.."), resolve(process.cwd(), "..")]) {
  const file = resolve(dir, ".env");
  if (existsSync(file)) { process.loadEnvFile(file); console.log(`Loaded environment from ${file}`); }
}
