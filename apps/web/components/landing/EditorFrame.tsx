import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Box, ChevronDown, Columns3, Component, Heading1, Layers, LayoutTemplate, MousePointer2, Plus, Search, Settings2, Square, Type } from "lucide-react";
import type { CSSProperties } from "react";
import { DemoPause } from "./DemoPause";

const Tile = ({ icon: I, label }: { icon: typeof Box; label: string }) => <div className="lp-tile"><I aria-hidden />{label}</div>;

/** The right panel in the sectioned layout: titled groups, paired compact fields, segmented controls. Shared with the "Style" section of the page. */
export function InspectorFrame({ className = "" }: { className?: string }) {
  return (
    <div className={`lp-insp ${className}`} aria-hidden="true">
      <div className="lp-insp-tabs"><span>Style</span><span>Settings</span></div>
      <div className="lp-sec"><h6>Size</h6>
        <div className="lp-2">
          <div className="lp-fld"><span>Min width</span><div className="lp-in">0 <em>px</em></div></div>
          <div className="lp-fld"><span>Min height</span><div className="lp-in">auto <ChevronDown /></div></div>
          <div className="lp-fld"><span>Max width</span><div className="lp-in">none <ChevronDown /></div></div>
          <div className="lp-fld"><span>Max height</span><div className="lp-in">none <ChevronDown /></div></div>
        </div>
      </div>
      <div className="lp-sec"><h6>Position</h6>
        <div className="lp-row"><span>Position</span><div className="lp-in">static <ChevronDown /></div></div>
        <div className="lp-row"><span>Z index</span><div className="lp-in">auto <ChevronDown /></div></div>
      </div>
      <div className="lp-sec"><h6>Typography</h6>
        <div className="lp-row"><span>Family</span><div className="lp-in">Inter <ChevronDown /></div></div>
        <div className="lp-row"><span>Weight</span><div className="lp-in">600 – Semi bold <ChevronDown /></div></div>
        <div className="lp-row"><span>Color</span><div className="lp-in"><b className="font-normal"><i className="lp-swatch" />black</b></div></div>
        <div className="lp-2">
          <div className="lp-fld"><span>Size</span><div className="lp-in">22 <em>px</em></div></div>
          <div className="lp-fld"><span>Height</span><div className="lp-in">1.05 <em>–</em></div></div>
        </div>
        <div className="lp-seg"><span className="on"><AlignLeft aria-hidden /></span><span><AlignCenter aria-hidden /></span><span><AlignRight aria-hidden /></span><span><AlignJustify aria-hidden /></span></div>
      </div>
      <div className="lp-sec"><h6>Backgrounds <Plus aria-hidden /></h6></div>
      <div className="lp-sec"><h6>Borders</h6><div className="lp-seg"><span className="on">–</span><span>—</span><span>┄</span><span>···</span></div></div>
    </div>
  );
}

/**
 * A live HTML copy of the editor, not a screenshot. With `demo` it plays the hero moment: a Section tile is dragged onto the
 * page, a drop line shows where it will land, the section appears selected. Everything is CSS; reduced motion shows the end state.
 */
export function EditorFrame({ demo = false, className = "" }: { demo?: boolean; className?: string }) {
  const vars = { "--x0": "4.6%", "--y0": "39%", "--x1": "38%", "--y1": "33%" } as CSSProperties;
  return (
    <div className={`lp-frame ${demo ? "lp-demo lp-frame-in" : "lp-frame-solo"} ${className}`} data-demo={demo ? "" : undefined} style={vars} role="img" aria-label="The Webbrik editor: components on the left, the page in the middle, style settings on the right">
      <div className="lp-bar" aria-hidden="true">
        <div className="lp-dots"><i /><i /><i /></div>
        <span className="lp-bar-name">Studio site</span>
        <span className="lp-bar-state"><i />Saved</span>
        <div className="lp-bar-end"><span className="lp-pill">Desktop</span><span className="lp-pill">100%</span><span className="lp-pill lp-pill-dark">Publish</span></div>
      </div>
      <div className="lp-body-row" aria-hidden="true">
        <div className="lp-rail"><span className="on"><Plus /></span><span><Layers /></span><span><LayoutTemplate /></span><span><Component /></span><span><Settings2 /></span></div>
        <div className="lp-lib">
          <h4>Components</h4>
          <div className="lp-search"><Search />Search components</div>
          <div className="lp-group">Layout</div>
          <div className="lp-tiles"><Tile icon={Square} label="Section" /><Tile icon={Box} label="Container" /><Tile icon={Columns3} label="Columns" /></div>
          <div className="lp-group">Typography</div>
          <div className="lp-tiles"><Tile icon={Heading1} label="Heading" /><Tile icon={Type} label="Text" /><Tile icon={MousePointer2} label="Button" /></div>
        </div>
        <div className="lp-canvas">
          <div className="lp-page">
            <div className="lp-page-nav"><b>Studio</b><span>Work</span><span>About</span><span>Contact</span></div>
            {demo ? (
              <>
                <div className="lp-slot" style={{ position: "relative" }}>
                  <div className="lp-newsec" style={{ position: "absolute", inset: "0 0 auto 0" }}>
                    <div className="lp-page-hero" style={{ position: "relative" }}>
                      <h5>Design that ships.</h5><p>Section added from the Components panel.</p><span className="b">Get in touch</span>
                      <div className="lp-sel lp-newsel"><i /><i /><i /><i /><b>Section</b></div>
                    </div>
                  </div>
                </div>
                <div style={{ position: "relative" }}><div className="lp-dropline lp-drop-line" style={{ top: -2 }} /></div>
              </>
            ) : (
              <div className="lp-page-hero" style={{ position: "relative" }}>
                <h5>Design that ships.</h5><p>Every element is a typed node in the document.</p><span className="b">Get in touch</span>
                <div className="lp-sel"><i /><i /><i /><i /><b>Heading</b></div>
              </div>
            )}
            <div className="lp-page-rows"><i /><i /><i /></div>
          </div>
        </div>
        <InspectorFrame />
      </div>
      {demo && <><div className="lp-chip" aria-hidden="true">Section</div><svg className="lp-cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 1.5L10 19 5 3z" fill="#000" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg><DemoPause /></>}
    </div>
  );
}
