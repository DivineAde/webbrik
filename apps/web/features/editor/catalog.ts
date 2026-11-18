export interface CatalogItem {
  tag: string;
  label: string;
  category: "Layout" | "Typography" | "Media" | "Forms" | "Navigation" | "Buttons" | "Lists";
  text?: string;
  styles?: Record<string, string>;
}

export const CATALOG: CatalogItem[] = [
  { tag: "section", label: "Section", category: "Layout", styles: { padding: "64px 24px" } },
  { tag: "header", label: "Header", category: "Layout", styles: { padding: "16px 24px", display: "flex", "align-items": "center", "justify-content": "space-between" } },
  { tag: "footer", label: "Footer", category: "Layout", styles: { padding: "32px 24px" } },
  { tag: "div", label: "Container", category: "Layout", styles: { "max-width": "1100px", margin: "0 auto" } },
  { tag: "div", label: "Flex row", category: "Layout", styles: { display: "flex", gap: "16px", "align-items": "center" } },
  { tag: "div", label: "Grid", category: "Layout", styles: { display: "grid", "grid-template-columns": "repeat(3, 1fr)", gap: "16px" } },
  { tag: "h1", label: "Heading 1", category: "Typography", text: "Heading", styles: { "font-size": "48px", "line-height": "1.1" } },
  { tag: "h2", label: "Heading 2", category: "Typography", text: "Heading", styles: { "font-size": "32px" } },
  { tag: "h3", label: "Heading 3", category: "Typography", text: "Heading", styles: { "font-size": "24px" } },
  { tag: "p", label: "Paragraph", category: "Typography", text: "Write something here." },
  { tag: "span", label: "Text", category: "Typography", text: "Text" },
  { tag: "blockquote", label: "Quote", category: "Typography", text: "A memorable quote." },
  { tag: "hr", label: "Divider", category: "Layout", styles: { border: "0", "border-top": "1px solid #e5e5e5", margin: "24px 0" } },
  { tag: "img", label: "Image", category: "Media", styles: { "max-width": "100%", height: "auto" } },
  { tag: "video", label: "Video", category: "Media" },
  { tag: "form", label: "Form", category: "Forms" },
  { tag: "input", label: "Input", category: "Forms" },
  { tag: "textarea", label: "Textarea", category: "Forms" },
  { tag: "label", label: "Label", category: "Forms", text: "Label" },
  { tag: "nav", label: "Nav", category: "Navigation", styles: { display: "flex", gap: "16px" } },
  { tag: "a", label: "Link", category: "Navigation", text: "Link" },
  { tag: "button", label: "Button", category: "Buttons", text: "Button", styles: { padding: "8px 16px", background: "#111", color: "#fff", "border-radius": "6px" } },
  { tag: "ul", label: "List", category: "Lists" },
  { tag: "li", label: "List item", category: "Lists", text: "Item" },
];
