import { describe, expect, it } from "vitest";
import { runBench } from "../bench/bench";

// Generous ceilings (roughly 10x what a laptop-class CPU measures) so only real regressions fail, not noisy CI machines.
const BUDGET: [match: RegExp, maxMs: number][] = [
  [/^render page \(5002/, 250], [/^compile CSS \(5002/, 150], [/^validate document \(5002/, 400], [/^apply one edit \(5002/, 40],
  [/^apply 200 edits in one batch \(5002/, 250], [/^static export \(5002/, 1000], [/^static export, 500 CMS/, 1500],
  [/^persist 10,000 new rows/, 3000], [/^persist 1 changed row/, 500], [/^cold start/, 2000],
  [/^API GET \/auth\/me/, 200], [/^API GET project document/, 200],
];

describe("performance budgets", () => {
  it("stay within ceilings", async () => {
    const results = await runBench([5_000]);
    for (const [re, max] of BUDGET) {
      const r = results.find((x) => re.test(x.name));
      expect(r, `missing benchmark ${re}`).toBeDefined();
      expect(r!.ms, `${r!.name} took ${r!.ms.toFixed(1)} ms (budget ${max} ms)`).toBeLessThan(max);
    }
  }, 120_000);
});
