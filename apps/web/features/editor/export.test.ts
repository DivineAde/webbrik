import { describe, expect, it } from "vitest";
import { zipFiles } from "./export";

describe("zipFiles", () => {
  it("writes a valid zip structure", () => {
    const z = zipFiles({ "index.html": "<p>hi</p>", "a/b.css": "x{}" });
    const dv = new DataView(z.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(dv.getUint16(z.length - 22 + 10, true)).toBe(2);
  });
});
