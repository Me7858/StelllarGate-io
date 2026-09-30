"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getMessages, type GlossaryId } from "./i18n";

const CLOSE_GRACE_MS = 120;

/**
 * A glossary term with an accessible definition tooltip.
 *
 * WCAG 1.4.13 (content on hover or focus):
 * - dismissible: Escape hides it without moving focus or the pointer
 * - hoverable:   the pointer can move from the term onto the tooltip
 *                (short close grace period + the tooltip keeps itself open)
 * - persistent:  no timeout; it stays until hover/focus leaves or it's dismissed
 *
 * Opens on mouse hover, keyboard focus, and tap (touch has no hover, so a
 * tap toggles it; tapping elsewhere closes it). The visible tooltip is
 * portalled to <body> so it isn't clipped by scrolling tables or the
 * chain's container query context. It's only created the first time it
 * opens — pages carry dozens of terms, and mounting a portal for each up
 * front measurably slowed the terminal on phones. Screen readers get the
 * definition from an always-present visually-hidden description instead.
 */
export function Term({ id, children }: { id: GlossaryId; children?: React.ReactNode }) {
  const entry = getMessages().glossary[id];
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionId = useId();
  const [everOpened, setEverOpened] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const open = (hovered || focused || pinned) && !dismissed;
  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleUnhover = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setHovered(false), CLOSE_GRACE_MS);
  };
  useEffect(() => cancelClose, []);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const tip = tooltipRef.current;
    if (!trigger || !tip) return;
    const r = trigger.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const margin = 8;
    let left = r.left;
    left = Math.min(left, window.innerWidth - tw - margin);
    left = Math.max(margin, left);
    let top = r.bottom + 6;
    if (top + th > window.innerHeight - margin && r.top - th - 6 > margin) top = r.top - th - 6;
    setPos({ top: top + window.scrollY, left: left + window.scrollX });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  // Escape dismisses from anywhere while open (the pointer may be resting
  // on the term with focus elsewhere); a tap outside unpins it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDismissed(true);
      setPinned(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || tooltipRef.current?.contains(target)) return;
      setPinned(false);
      setHovered(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  if (!entry) return <>{children}</>;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="term"
        data-term={id}
        aria-describedby={descriptionId}
        aria-expanded={open}
        onPointerEnter={e => {
          if (e.pointerType !== "mouse") return;
          cancelClose();
          setDismissed(false);
          setHovered(true);
        }}
        onPointerLeave={e => {
          if (e.pointerType === "mouse") scheduleUnhover();
        }}
        onFocus={() => {
          setDismissed(false);
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
          setPinned(false);
        }}
        onClick={e => {
          // Inside clickable rows/headers the term shouldn't also trigger the parent.
          e.stopPropagation();
          setDismissed(false);
          setPinned(p => !p);
        }}
      >
        {children ?? entry.term}
      </button>
      <span id={descriptionId} className="sr-only">{entry.definition}</span>
      {everOpened && createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          hidden={!open}
          className="term-tooltip"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          onPointerEnter={e => {
            if (e.pointerType === "mouse") {
              cancelClose();
              setHovered(true);
            }
          }}
          onPointerLeave={e => {
            if (e.pointerType === "mouse") scheduleUnhover();
          }}
        >
          <strong style={{ display: "block", marginBottom: 4, color: "var(--brand)" }}>{entry.term}</strong>
          {entry.definition}
        </div>,
        document.body
      )}
    </>
  );
}
