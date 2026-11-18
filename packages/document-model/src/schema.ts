import { z } from "zod";

export const SCHEMA_VERSION = 1;

/** Style values keyed by CSS property (kebab-case). Values may reference tokens via var(--token). */
export const StyleMapSchema = z.record(z.string(), z.string());
export type StyleMap = z.infer<typeof StyleMapSchema>;

/** A style block scoped to a breakpoint id and optional state (e.g. ":hover"). */
export const StyleBlockSchema = z.object({
  breakpoint: z.string().default("base"),
  state: z.string().optional(),
  declarations: StyleMapSchema,
});
export type StyleBlock = z.infer<typeof StyleBlockSchema>;

export const StyleClassSchema = z.object({
  id: z.string(),
  name: z.string().regex(/^[a-zA-Z_][\w-]*$/, "invalid class name"),
  blocks: z.array(StyleBlockSchema),
});
export type StyleClass = z.infer<typeof StyleClassSchema>;

export const BreakpointSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** max-width in px; "base" breakpoint has no query. Desktop-first. */
  maxWidth: z.number().int().positive().optional(),
});
export type Breakpoint = z.infer<typeof BreakpointSchema>;

export const BindingSchema = z.object({
  collectionId: z.string(),
  field: z.string(),
  /** What the field value drives: the element's text, or one of its attributes. */
  target: z.enum(["text", "src", "href", "alt", "html"]).default("text"),
});

export const InteractionSchema = z.object({
  id: z.string(),
  trigger: z.enum(["click", "hover", "focus", "scroll", "load", "visible", "keydown"]),
  action: z.enum(["show", "hide", "toggle", "navigate", "scrollTo", "animate"]),
  targetId: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const ElementNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["element", "text", "component-instance", "slot"]),
  tag: z.string().default("div"),
  name: z.string().optional(),
  parentId: z.string().nullable(),
  children: z.array(z.string()),
  attributes: z.record(z.string(), z.string()).default({}),
  text: z.string().optional(),
  classIds: z.array(z.string()).default([]),
  styles: z.array(StyleBlockSchema).default([]),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  componentId: z.string().optional(),
  props: z.record(z.string(), z.unknown()).default({}),
  binding: BindingSchema.optional(),
  interactions: z.array(InteractionSchema).default([]),
});
export type ElementNode = z.infer<typeof ElementNodeSchema>;

export const PageSchema = z.object({
  id: z.string(),
  name: z.string(),
  route: z.string().regex(/^\/[a-zA-Z0-9\-_/:\[\]]*$/, "invalid route"),
  rootId: z.string(),
  meta: z
    .object({ title: z.string().optional(), description: z.string().optional(), ogImage: z.string().optional() })
    .default({}),
  isHome: z.boolean().default(false),
  /** Dynamic pages (route contains `:slug`) are generated once per published item of this collection. */
  collectionId: z.string().optional(),
});
export type Page = z.infer<typeof PageSchema>;

export const ComponentDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  rootId: z.string(),
  props: z.array(z.object({ name: z.string(), type: z.enum(["text", "image", "color", "link", "boolean", "variant"]), default: z.unknown().optional() })).default([]),
  variants: z.array(z.string()).default([]),
});
export type ComponentDef = z.infer<typeof ComponentDefSchema>;

export const AnimationSchema = z.object({
  id: z.string(),
  name: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/, "invalid animation name"),
  keyframes: z.array(z.object({ offset: z.number().min(0).max(1), declarations: StyleMapSchema })).min(2),
  duration: z.number().int().min(0).max(60_000).default(400),
  delay: z.number().int().min(0).max(60_000).default(0),
  easing: z.string().regex(/^[a-z0-9(),.\- ]+$/i).max(80).default("ease"),
  iterations: z.union([z.number().int().min(1).max(100), z.literal("infinite")]).default(1),
  direction: z.enum(["normal", "reverse", "alternate", "alternate-reverse"]).default("normal"),
  fill: z.enum(["none", "forwards", "backwards", "both"]).default("both"),
});
export type Animation = z.infer<typeof AnimationSchema>;

export const DocumentSchema = z.object({
  version: z.literal(SCHEMA_VERSION),
  id: z.string(),
  name: z.string(),
  nodes: z.record(z.string(), ElementNodeSchema),
  pages: z.array(PageSchema),
  classes: z.record(z.string(), StyleClassSchema).default({}),
  components: z.record(z.string(), ComponentDefSchema).default({}),
  animations: z.record(z.string(), AnimationSchema).default({}),
  breakpoints: z.array(BreakpointSchema),
  tokens: z.record(z.string(), z.string()).default({}),
  customCode: z.object({ headHtml: z.string().default(""), customCss: z.string().default("") }).default({}),
});
export type Document = z.infer<typeof DocumentSchema>;

export const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { id: "base", label: "Desktop" },
  { id: "tablet", label: "Tablet", maxWidth: 991 },
  { id: "mobile", label: "Mobile", maxWidth: 479 },
];
