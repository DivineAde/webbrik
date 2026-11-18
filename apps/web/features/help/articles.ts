export interface Article { id: string; section: string; title: string; body: string[]; keywords?: string }

/** Help content lives next to the code so it ships with the features it describes. Plain paragraphs; a line starting "• " is a list item. */
export const ARTICLES: Article[] = [
  { id: "first-site", section: "Getting started", title: "Build and publish your first site", keywords: "start begin new project", body: [
    "Create a project from the dashboard. You land in the editor with an empty page.",
    "• Add elements from the Elements tab (click, or drag onto the canvas). Use Section and Container for structure, then headings, paragraphs, images and buttons.",
    "• Select an element and use the Design panel on the right to change its size, spacing, colours and typography.",
    "• Switch between Desktop, Tablet and Mobile at the top. Changes made on Desktop flow down to smaller screens until you override them there.",
    "• Press Preview to try the page like a visitor would. When you're happy, open Manage → Publish and publish a preview or production deployment.",
  ] },
  { id: "tour", section: "Getting started", title: "A tour of the editor", keywords: "navigator panel layout", body: [
    "Left: Elements (things to add), Navigator (the page tree), Pages, Templates, Components and Tokens (your design variables).",
    "Centre: the canvas. What you see is rendered by the same engine that produces your published site.",
    "Right: Design (styles), Interact (what happens on click, hover and so on), Animate, Quality (accessibility and performance checks), Code, AI and History.",
    "Press ⌘K (Ctrl+K) for the command palette: every action is searchable.",
  ] },
  { id: "layout", section: "Editing", title: "Layout: flow, flex, grid and free positioning", keywords: "position absolute drag move", body: [
    "By default elements flow one after another. Use Flex row or Grid containers to arrange children side by side, with gap and alignment controls in the Design panel.",
    "For exact placement, select an element and choose Free in the Design panel's Position section. The element leaves the flow and is placed by X/Y coordinates inside its parent; drag it, use the eight resize handles, or nudge with the arrow keys (Shift for 10 px). Choose Flow to put it back.",
    "Free positions are stored per screen size, so a layout that is precise on Desktop can be simple on Mobile.",
    "Turn on Rulers in the toolbar, then drag from a ruler to create guides. Elements snap to guides, to their siblings and to the parent's edges.",
  ] },
  { id: "responsive", section: "Editing", title: "Responsive design and comparing screen sizes", keywords: "breakpoint mobile tablet compare", body: [
    "Styles you set while Desktop is active apply everywhere. Switching to Tablet or Mobile and changing a value overrides it for that size and narrower.",
    "Compare shows every screen size side by side. Click an element in any frame to select it and edit it at that frame's size.",
  ] },
  { id: "interactions", section: "Editing", title: "Interactions and animations", keywords: "click hover scroll animate show hide", body: [
    "Open the Interact tab with an element selected, press Add interaction and say what should happen: when this element is clicked, hovered or scrolled into view, show, hide or toggle another element, play an animation, scroll somewhere, or go to a link.",
    "Create animations in the Animate tab: add keyframes on the timeline, write the styles for each stop, set duration, delay, easing and repeat, and press Preview to watch it.",
    "Interactions run in Preview and on the published site without extra setup.",
  ] },
  { id: "shortcuts", section: "Editing", title: "Keyboard shortcuts", keywords: "keys hotkeys", body: [
    "• ⌘K / Ctrl+K: command palette",
    "• ⌘Z / ⇧⌘Z: undo / redo",
    "• ⌘D: duplicate, Delete: remove the selected element",
    "• Alt + ↑ / ↓: move among siblings; Alt + → / ←: indent into the previous sibling / outdent",
    "• Arrow keys: nudge a free-positioned element (Shift = 10 px)",
    "• Shift/⌘-click: select several elements",
  ] },
  { id: "cms", section: "Content and forms", title: "Collections and dynamic pages (CMS)", keywords: "cms content collection items repeat bind", body: [
    "Open the project page → Content to define a collection (fields such as text, rich text, image, and references to other collections) and add items.",
    "In the editor, select an element and use Content binding: repeat it for every item of a collection (with filtering, sorting, limit and pagination), or bind its text, image or link to a field. Paths like author.name follow references.",
    "Make a page dynamic by giving it a route such as /blog/:slug; one page is generated per item.",
    "Published sites that use Webbrik hosting refresh content when you publish; static exports are a snapshot of the content at export time.",
  ] },
  { id: "forms", section: "Content and forms", title: "Forms and submissions", keywords: "form submit email spam csv", body: [
    "Add a Form element with inputs and a Button. Give it a form name in the Design panel.",
    "Submissions are collected under the project's Forms tab, where you can read, delete and export them as CSV. Optional email notifications and spam protection (honeypot) are in the form's settings.",
  ] },
  { id: "publish", section: "Publishing", title: "Publishing, domains and rollbacks", keywords: "domain deploy production preview rollback", body: [
    "Manage → Publish creates a deployment. Preview deployments are for checking; Production is what visitors see.",
    "Add a custom domain on a paid plan, point its DNS as shown, and verify it. Every production deployment can be rolled back from the deployment list.",
    "The Quality tab lists accessibility and performance findings. Publishing with the strict option is blocked while errors remain.",
  ] },
  { id: "export", section: "Publishing", title: "Exporting your site as code", keywords: "export zip react html", body: [
    "Export downloads your site as static HTML/CSS, or as a React/Vite project. Content is included as of the moment you export.",
  ] },
  { id: "teams", section: "Teams and collaboration", title: "Inviting teammates and working together", keywords: "invite member role collaborate live", body: [
    "Invite people from the workspace page; they choose a role (viewer, editor, admin). Several people can edit one project at once: changes appear for everyone within moments, shown as Live in the toolbar.",
    "History keeps every saved version. Compare any version to the current one to see what changed, side by side, and restore it if you need to.",
  ] },
  { id: "billing", section: "Account and billing", title: "Plans, coupons, upgrades and invoices", keywords: "pro team paystack invoice vat tax coupon upgrade cancel", body: [
    "Workspace → Plan shows what you're on and what you can upgrade to. Prices are shown before tax; any tax is added at checkout and itemised.",
    "Enter a coupon code and press Apply to see the discounted total before you pay. Discounted purchases are a single one-month payment; they don't renew automatically.",
    "Upgrading from Pro to Team charges only the difference for the rest of the period you've already paid for; your renewal date doesn't move.",
    "Every successful payment has an invoice you can download as a PDF. Cancelling keeps your plan until the end of the paid period.",
  ] },
  { id: "account", section: "Account and billing", title: "Email, password and security", keywords: "email change password two factor mfa oauth github google", body: [
    "Account → change your name, email, password, and set up two-factor authentication. Changing your email needs your password and a confirmation link sent to the new address; nothing changes until you confirm it.",
    "If your organisation enabled it, you can also sign in with GitHub or Google from the sign-in page.",
  ] },
  { id: "trouble-save", section: "Troubleshooting", title: "My changes aren't saving", keywords: "offline save conflict", body: [
    "The toolbar shows Saved, Saving… or an error. If you were offline, edits are kept and retried; keep the tab open until it says Saved.",
    "If two people change the same thing at once, the later change wins for that property and both of you see the result immediately.",
  ] },
  { id: "trouble-live", section: "Troubleshooting", title: "“Polling” instead of “Live” in the toolbar", keywords: "websocket realtime", body: [
    "Live means collaborator changes arrive instantly. Polling means the browser checks every few seconds instead (usually because a network proxy blocks WebSockets). Everything still works; updates are just slightly delayed.",
  ] },
];
