import { useCallback, useEffect, useRef, useState } from "react";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Crosshair + zoom for the payoff charts, on every input type:
 * - mouse: hover for the crosshair, ctrl/⌘+wheel (or trackpad pinch) to zoom
 * - touch: drag a finger for the crosshair, two-finger pinch to zoom
 * - keyboard: ←/→ move the crosshair, +/− zoom, 0 resets
 * - double-click/double-tap resets zoom
 *
 * Coordinates are in the chart's own SVG units, so it works when the SVG is
 * scaled to fit a narrow container. The SVG should carry the `chart-touch`
 * class (touch-action: pan-y) so vertical page scrolling still works.
 */
export function useChartGestures({ svgWidth, plotLeft, plotWidth }: { svgWidth: number; plotLeft: number; plotWidth: number }) {
  const [zoom, setZoom] = useState(1);
  const [cursor, setCursor] = useState<number | null>(null); // plot x in [0, plotWidth]
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, number>()); // pointerId → clientX
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const lastTap = useRef(0);

  const toPlotX = useCallback((clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const scale = r.width > 0 ? svgWidth / r.width : 1;
    return Math.min(plotWidth, Math.max(0, (clientX - r.left) * scale - plotLeft));
  }, [svgWidth, plotLeft, plotWidth]);

  const spread = () => {
    const xs = Array.from(pointers.current.values());
    return xs.length >= 2 ? Math.abs(xs[0] - xs[1]) : 0;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== "mouse") e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, e.clientX);
    if (pointers.current.size === 2) {
      pinch.current = { dist: Math.max(1, spread()), zoom };
      setCursor(null);
      return;
    }
    if (e.pointerType === "touch") {
      const now = performance.now();
      if (now - lastTap.current < 300) setZoom(1);
      lastTap.current = now;
    }
    setCursor(toPlotX(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, e.clientX);
    if (pinch.current && pointers.current.size >= 2) {
      setZoom(clampZoom(pinch.current.zoom * (spread() / pinch.current.dist)));
      return;
    }
    if (e.pointerType === "mouse" || pointers.current.has(e.pointerId)) setCursor(toPlotX(e.clientX));
  };

  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (e.pointerType !== "mouse" && pointers.current.size === 0) setCursor(null);
  };

  const onPointerLeave = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse") setCursor(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const step = plotWidth / 40;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setCursor(c => Math.min(plotWidth, Math.max(0, (c ?? plotWidth / 2) + (e.key === "ArrowLeft" ? -step : step))));
    } else if (e.key === "+" || e.key === "=") {
      setZoom(z => clampZoom(z * 1.25));
    } else if (e.key === "-" || e.key === "_") {
      setZoom(z => clampZoom(z / 1.25));
    } else if (e.key === "0") {
      setZoom(1);
    }
  };

  // Trackpad pinch arrives as ctrl+wheel; needs a non-passive listener to
  // stop the browser zooming the whole page instead.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(z => clampZoom(z * Math.exp(-e.deltaY / 200)));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  return {
    zoom,
    cursor,
    resetZoom: () => setZoom(1),
    svgProps: {
      ref: svgRef,
      className: "chart-touch",
      tabIndex: 0,
      onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onPointerLeave,
      onKeyDown,
      onDoubleClick: () => setZoom(1),
      onBlur: () => setCursor(null),
    },
  };
}
