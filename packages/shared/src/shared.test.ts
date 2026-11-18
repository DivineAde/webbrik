import { describe, expect, it } from "vitest";
import { can, checkQuota, isValidSlug } from "./index";

describe("shared", () => {
  it("enforces role permissions", () => {
    expect(can("VIEWER", "project:edit")).toBe(false);
    expect(can("EDITOR", "project:edit")).toBe(true);
    expect(can("EDITOR", "project:publish")).toBe(false);
    expect(can("DEVELOPER", "project:code")).toBe(true);
    expect(can("ADMIN", "workspace:billing")).toBe(false);
    expect(can("OWNER", "workspace:billing")).toBe(true);
    expect(can(undefined, "project:view")).toBe(false);
  });
  it("checks quotas and slugs", () => {
    expect(checkQuota("free", "maxProjects", 2)).toBe(true);
    expect(checkQuota("free", "maxProjects", 3)).toBe(false);
    expect(checkQuota("free", "customDomains", 0)).toBe(false);
    expect(isValidSlug("my-site")).toBe(true);
    expect(isValidSlug("-bad")).toBe(false);
  });
});
