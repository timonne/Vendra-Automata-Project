import { useEffect, useRef } from "react";
import originalSvg from "./assets/machine.svg?raw";
import { product, type Code, type Transition } from "./fsm";

// Keep the supplied SVG intact; namespace only IDs so its editable layers can
// be rendered in three independently clipped, synchronized views.
function graphic(prefix: string) {
  return originalSvg
    .replace(/id="([^"]+)"/g, `id="${prefix}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`);
}
const views = { main: graphic("main"), buttons: graphic("buttons"), dispense: graphic("dispense") };
// Stable objects prevent React from replacing the SVG DOM on unrelated renders
// (which would discard VendingUI's animated classes and event listeners).
const markup = {
  main: { __html: views.main },
  buttons: { __html: views.buttons },
  dispense: { __html: views.dispense },
};

export default function Machine({
  selected,
  last,
  stage,
  speed,
  onSelect,
  invalid,
}: {
  selected: Code[];
  last?: Transition;
  stage: string;
  speed: number;
  onSelect: (code: Code) => void;
  invalid: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) return;
    const syncAll = (fn: (svg: SVGSVGElement, prefix: string) => void) => {
      Object.keys(views).forEach((prefix) => {
        const svg = root.current!.querySelector<SVGSVGElement>(`#${prefix}-machine`);
        if (svg) fn(svg, prefix);
      });
    };
    // Adapted from the uploaded VendingUI: all source layers are mirrored.
    const VendingUI = {
      pressButton(code: Code) {
        syncAll((svg, prefix) => svg.querySelector(`#${prefix}-btn-${code}`)?.classList.add("lit"));
      },
      setDisplay(text: string) {
        syncAll((svg, prefix) => {
          const display = svg.querySelector(`#${prefix}-display`);
          if (display) display.textContent = text;
        });
      },
      setIndicator(name: string, on: boolean) {
        syncAll((svg, prefix) =>
          svg.querySelector(`#${prefix}-light-${name}`)?.classList.toggle("on", on),
        );
      },
    };
    syncAll((svg, prefix) => {
      svg.querySelectorAll(".btn").forEach((button) => button.classList.remove("lit"));
      svg
        .querySelector(`#${prefix}-dispense-flap`)
        ?.classList.toggle("open", stage === "Dispensing");
      const item = svg.querySelector(`#${prefix}-product-out`);
      item?.classList.remove("drop");
      if (last?.kind === "release" && last.code) {
        svg.querySelector(`#${prefix}-out-item`)?.setAttribute("fill", product(last.code).color);
        // Restart the original product layer for every release, including repeats.
        item?.getBoundingClientRect();
        item?.classList.add("drop");
      }
    });
    selected.forEach(VendingUI.pressButton);
    VendingUI.setDisplay(
      last?.code ?? (stage === "Ready" ? "READY" : stage === "Complete" ? "DONE" : "0.00"),
    );
    VendingUI.setIndicator("vend", stage === "Ready" || stage === "Dispensing");
    VendingUI.setIndicator("coin", selected.length > 0);
    VendingUI.setIndicator("error", invalid);
    // Pan the magnifier to the active row so B-button lighting is never hidden.
    const panelZoom = root.current.querySelector<SVGSVGElement>(".lens-buttons svg");
    if (panelZoom) panelZoom.style.top = last?.code?.startsWith("B") ? "-148%" : "-55%";
  }, [selected.join(","), last?.id, stage, invalid]);

  useEffect(() => {
    const buttons = root.current?.querySelectorAll<SVGGElement>(".btn");
    buttons?.forEach((button) => {
      const code = button.dataset.code as Code;
      button.setAttribute("role", "button");
      button.setAttribute("tabindex", "0");
      button.setAttribute("aria-label", `Select ${code}, ${product(code).name}`);
      button.onclick = () => onSelect(code);
      button.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(code);
        }
      };
    });
  }, [onSelect]);

  return (
    <div
      className="machine-scene"
      ref={root}
      style={{ "--event-time": `${1600 / speed}ms` } as React.CSSProperties}
    >
      <div className="scene-corner top-left" />
      <div className="scene-corner bottom-right" />
      <div className="machine-ground" />
      <div className="machine-original" dangerouslySetInnerHTML={markup.main} />
      <svg
        className="lens-connectors"
        viewBox="0 0 600 480"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M297 142H385L425 105M224 366H375L427 330" />
        <circle cx="297" cy="142" r="3" />
        <circle cx="224" cy="366" r="3" />
      </svg>
      <div className="zoom-callout button-callout">
        <div className="lens lens-buttons" dangerouslySetInnerHTML={markup.buttons} />
        <span>
          <i /> BUTTON PANEL
        </span>
        <small>Live selection view</small>
      </div>
      <div className="zoom-callout dispense-callout">
        <div className="lens lens-dispense" dangerouslySetInnerHTML={markup.dispense} />
        <span>
          <i /> DISPENSING BAY
        </span>
        <small>Live output view</small>
      </div>
      <div className="scene-caption">
        <span className="tiny-dot" /> INTERACTIVE MACHINE <span className="caption-divider">/</span>{" "}
        SVG LIVE VIEW
      </div>
    </div>
  );
}
