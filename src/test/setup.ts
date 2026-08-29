import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});

// Radix primitives (dropdown menu, sheet, ...) probe these DOM APIs, which
// jsdom doesn't implement.
if (typeof window !== "undefined") {
  window.HTMLElement.prototype.hasPointerCapture ??= () => false;
  window.HTMLElement.prototype.setPointerCapture ??= () => {};
  window.HTMLElement.prototype.releasePointerCapture ??= () => {};
  window.HTMLElement.prototype.scrollIntoView ??= () => {};
  window.HTMLElement.prototype.scrollTo ??= () => {};

  if (typeof window.ResizeObserver === "undefined") {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  // jsdom doesn't implement matchMedia; this generic min-width evaluator
  // (against jsdom's fixed 1024px innerWidth) is enough for components that
  // pick a layout via `(min-width: …px)` queries, e.g. useCookingLayoutMode.
  if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (query: string) => {
      const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/);
      const matches = minWidthMatch
        ? window.innerWidth >= Number(minWidthMatch[1])
        : false;
      return {
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList;
    };
  }
}
