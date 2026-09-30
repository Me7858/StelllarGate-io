import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// jsdom lacks these; components only need them to exist.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
window.matchMedia ??= ((query: string) => ({
  matches: false, media: query, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

vi.mock("next/navigation", () => ({
  usePathname: () => "/options",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Freighter isn't available in tests; report "not installed".
vi.mock("@stellar/freighter-api", () => ({
  default: {
    isConnected: vi.fn(async () => false),
    isAllowed: vi.fn(async () => false),
    requestAccess: vi.fn(),
    getPublicKey: vi.fn(),
    getNetworkDetails: vi.fn(async () => ({ network: "TESTNET" })),
    signBlob: vi.fn(),
  },
}));

// jsdom has no PointerEvent; without it fireEvent.pointer* drops pointerType.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}
