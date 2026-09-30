"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { format, getMessages } from "./i18n";
import { useOnboardingStore } from "./store";

type Rect = { top: number; left: number; width: number; height: number };

/** First *visible* element carrying `data-tour=<anchor>` — the same anchor can
 *  exist in both the desktop and mobile layouts, only one of which shows. */
export function findTourAnchor(anchor: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`));
  return nodes.find(n => {
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) ?? null;
}

/**
 * Tracks an anchor's viewport rect through anything that can move it:
 * resizes, scrolling (any container), DOM changes (tabs switching, the
 * ticket opening, the header wrapping on a narrow screen) and the element's
 * own size changes. Anchoring to data-tour attributes rather than CSS
 * classes means restyling or rearranging the layout doesn't break the tour.
 */
function useAnchorRect(anchor: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!anchor) {
      setRect(null);
      return;
    }
    let frame = 0;
    let observed: HTMLElement | null = null;
    const resizeObserver = new ResizeObserver(() => schedule());

    const measure = () => {
      frame = 0;
      const el = findTourAnchor(anchor);
      if (el !== observed) {
        if (observed) resizeObserver.unobserve(observed);
        if (el) resizeObserver.observe(el);
        observed = el;
      }
      if (!el) {
        setRect(prev => (prev === null ? prev : null));
        return;
      }
      const r = el.getBoundingClientRect();
      setRect(prev =>
        prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height }
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "data-tour"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [anchor]);

  return rect;
}

const PAD = 4;
const CARD_W = 320;

export function TourOverlay() {
  const { tourStep, goToStep, pauseTour, skipTour, completeTour } = useOnboardingStore();
  const pathname = usePathname();
  const content = getMessages().tour;
  const steps = content.steps;
  const index = Math.min(tourStep, steps.length - 1);
  const step = steps[index];
  const onRoute = !step.route || pathname === step.route;
  const rect = useAnchorRect(onRoute ? step.anchor : null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const [cardSize, setCardSize] = useState({ w: CARD_W, h: 180 });
  const [viewport, setViewport] = useState({ w: 1024, h: 768 });

  useLayoutEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const anchored = rect !== null;
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setCardSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [index, anchored, viewport.w]);

  // Move focus to the step heading when the step changes (not on every
  // re-measure), so keyboard and screen reader users follow along. The tour
  // is non-modal: everything behind it stays usable.
  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) pauseTour();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pauseTour]);

  const isLast = index === steps.length - 1;
  const narrow = viewport.w <= 640;

  let cardStyle: React.CSSProperties;
  if (narrow || !rect) {
    // Phones, or anchor not on screen: dock the card instead of pointing at nothing.
    cardStyle = narrow
      ? { left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", width: "auto" }
      : { left: Math.max(16, (viewport.w - cardSize.w) / 2), top: Math.max(16, (viewport.h - cardSize.h) / 2) };
  } else {
    const below = rect.top + rect.height + PAD + 12;
    const above = rect.top - PAD - 12 - cardSize.h;
    const top = below + cardSize.h <= viewport.h - 16 ? below : above >= 16 ? above : Math.max(16, viewport.h - cardSize.h - 16);
    const left = Math.min(Math.max(16, rect.left), viewport.w - cardSize.w - 16);
    cardStyle = { top, left };
  }

  const body = rect ? step.body : `${step.missing} ${step.body}`;

  return (
    <>
      {rect && (
        <div
          className="tour-spotlight"
          aria-hidden
          data-testid="tour-spotlight"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      )}
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby={headingId}
        data-testid="tour-card"
        data-step={step.id}
        style={cardStyle}
      >
        <div style={{ fontSize: 10, color: "var(--text-lo)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
          {format(content.controls.progress, { current: index + 1, total: steps.length })}
        </div>
        <h2 id={headingId} tabIndex={-1} style={{ fontSize: 15, fontWeight: 700, color: "var(--text-hi)", marginBottom: 8, outline: "none" }}>
          {step.title}
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-mid)", lineHeight: 1.55, marginBottom: 14 }}>{body}</p>
        {!onRoute && step.route && (
          <Link href={step.route} className="tap" style={{ display: "inline-flex", alignItems: "center", fontSize: 12, color: "var(--brand)", marginBottom: 12 }}>
            {content.controls.goToChain} →
          </Link>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="tap" onClick={skipTour} style={{ fontSize: 11, color: "var(--text-lo)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
            {content.controls.skip}
          </button>
          <button type="button" className="tap" onClick={pauseTour} aria-label={content.controls.pause} title={content.controls.pause} style={{ fontSize: 11, color: "var(--text-lo)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
            ✕
          </button>
          <span style={{ flex: 1 }} />
          {index > 0 && (
            <button type="button" className="tap" onClick={() => goToStep(index - 1)} style={{
              fontSize: 12, padding: "6px 12px", background: "none", color: "var(--text-mid)", border: "1px solid var(--border-default)", cursor: "pointer",
            }}>{content.controls.back}</button>
          )}
          <button type="button" className="tap" data-testid="tour-next" onClick={() => (isLast ? completeTour() : goToStep(index + 1))} style={{
            fontSize: 12, fontWeight: 700, padding: "6px 14px", background: "var(--brand)", color: "var(--bg)", border: "none", cursor: "pointer",
          }}>{isLast ? content.controls.finish : content.controls.next}</button>
        </div>
      </div>
    </>
  );
}
