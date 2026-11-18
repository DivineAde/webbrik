import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, BoxSelect, Copy, EyeOff, Lock, Package, Plus, Trash2 } from "lucide-react";

const ROWS: [typeof ArrowUp, string, string?, boolean?][] = [
  [ArrowUp, "Move up", "Alt+↑"], [ArrowDown, "Move down", "Alt+↓", true], [ArrowUpToLine, "Move to start"], [ArrowDownToLine, "Move to end"],
  [Plus, "Add inside"], [Copy, "Duplicate", "Ctrl+D"], [BoxSelect, "Wrap in container"], [Package, "Create component"], [EyeOff, "Hide"], [Lock, "Lock"], [Trash2, "Delete", "⌫"],
];

/** The canvas with the right-click menu open on one paragraph: live HTML, the same actions the editor offers. */
export function MenuFrame() {
  return (
    <div className="lp-frame lp-frame-solo lp-menuframe" role="img" aria-label="The editor canvas with a right-click menu open on a paragraph: move up, move down, duplicate, wrap in container, create component, hide, lock and delete">
      <div className="lp-bar" aria-hidden="true">
        <div className="lp-dots"><i /><i /><i /></div>
        <span className="lp-bar-name">Studio site</span><span className="lp-bar-state"><i />Saved</span>
      </div>
      <div className="lp-canvas lp-menu-canvas" aria-hidden="true">
        <div className="lp-page" style={{ height: "auto", minHeight: "100%" }}>
          <div className="lp-page-nav"><b>Studio</b><span>Work</span><span>About</span><span>Contact</span></div>
          <div className="lp-page-hero"><h5>Design that ships.</h5></div>
          <div className="lp-mp-sel"><p>Every element is a typed node in the document.</p><div className="lp-sel"><i /><i /><i /><i /><b>Paragraph</b></div></div>
          <div className="lp-page-hero" style={{ paddingTop: 8 }}><span className="b">Get in touch</span></div>
          <div className="lp-page-rows"><i /><i /><i /></div>
        </div>
        <div className="lp-ctx">
          <div className="lp-ctx-h">Paragraph <code>&lt;p&gt;</code></div>
          {ROWS.map(([I, label, key, on], i) => (
            <div key={label} className={`lp-ctx-r ${on ? "on" : ""}`} style={i === 4 || i === 8 ? { marginTop: 5, borderTop: "1px solid var(--lp-line)", paddingTop: 7 } : undefined}><I />{label}{key && <kbd>{key}</kbd>}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
