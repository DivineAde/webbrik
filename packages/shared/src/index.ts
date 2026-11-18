export type Role = "OWNER" | "ADMIN" | "EDITOR" | "DESIGNER" | "DEVELOPER" | "VIEWER";

export type Permission =
  | "project:view"
  | "project:edit"
  | "project:design"
  | "project:code"
  | "project:publish"
  | "project:settings"
  | "project:delete"
  | "workspace:invite"
  | "workspace:manage-members"
  | "workspace:settings"
  | "workspace:billing"
  | "content:publish"
  | "comment:write";

const VIEW: Permission[] = ["project:view", "comment:write"];
const EDIT: Permission[] = [...VIEW, "project:edit", "content:publish"];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  VIEWER: new Set(VIEW),
  EDITOR: new Set(EDIT),
  DESIGNER: new Set([...EDIT, "project:design"]),
  DEVELOPER: new Set([...EDIT, "project:design", "project:code", "project:publish"]),
  ADMIN: new Set<Permission>([...EDIT, "project:design", "project:code", "project:publish", "project:settings", "project:delete", "workspace:invite", "workspace:manage-members", "workspace:settings"]),
  OWNER: new Set<Permission>([...EDIT, "project:design", "project:code", "project:publish", "project:settings", "project:delete", "workspace:invite", "workspace:manage-members", "workspace:settings", "workspace:billing"]),
};

export function can(role: Role | undefined, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].has(permission);
}

export interface Entitlements {
  maxProjects: number;
  maxMembers: number;
  storageMb: number;
  publishesPerMonth: number;
  aiCreditsPerMonth: number;
  customDomains: boolean;
}

export const PLANS: Record<string, Entitlements> = {
  free: { maxProjects: 3, maxMembers: 1, storageMb: 500, publishesPerMonth: 20, aiCreditsPerMonth: 20, customDomains: false },
  pro: { maxProjects: 50, maxMembers: 10, storageMb: 20_000, publishesPerMonth: 1000, aiCreditsPerMonth: 1000, customDomains: true },
  team: { maxProjects: 500, maxMembers: 50, storageMb: 200_000, publishesPerMonth: 10_000, aiCreditsPerMonth: 10_000, customDomains: true },
};

export function checkQuota(plan: string, metric: keyof Entitlements, used: number): boolean {
  const limit = (PLANS[plan] ?? PLANS["free"]!)[metric];
  return typeof limit === "number" ? used < limit : !!limit;
}

/** Validate a route/page-level slug. */
export const isValidSlug = (s: string) => /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(s);
