import { JSDOM } from "jsdom";

let domReady = false;

export function ensureDom() {
  if (domReady) return;
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  const { window } = dom;

  Object.assign(globalThis, {
    window,
    document: window.document,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
  });
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
  });

  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  class PointerEvent extends window.MouseEvent {}

  (globalThis as any).ResizeObserver = ResizeObserver;
  (globalThis as any).PointerEvent = PointerEvent;
  (window.HTMLElement.prototype as any).scrollIntoView = () => {};
  (window as any).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });

  domReady = true;
}

export function resetDom() {
  ensureDom();
  document.body.innerHTML = "";
  localStorage.clear();
  sessionStorage.clear();
}
