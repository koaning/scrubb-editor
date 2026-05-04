export const SIDEBAR_MIN = 140;
export const SIDEBAR_MAX = 500;
export const SIDEBAR_WIDTH_KEY = "scrubb.sidebarWidth";

export interface SidebarResizerOptions {
  app: HTMLElement;
  handle: HTMLElement;
  onWidthChange?: (width: number) => void;
}

export function attachSidebarResizer(opts: SidebarResizerOptions) {
  let startX = 0;
  let startWidth = 0;
  let dragging = false;

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    const cs = getComputedStyle(opts.app);
    startWidth = parseFloat(cs.getPropertyValue("--sidebar-width")) || opts.app.offsetLeft;
    document.body.classList.add("sidebar-resizing");
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    e.preventDefault();
    const next = clamp(startWidth + (e.clientX - startX), SIDEBAR_MIN, SIDEBAR_MAX);
    opts.app.style.setProperty("--sidebar-width", `${next}px`);
    opts.onWidthChange?.(next);
  };

  const onMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("sidebar-resizing");
    const cs = getComputedStyle(opts.app);
    const finalWidth = parseFloat(cs.getPropertyValue("--sidebar-width"));
    if (Number.isFinite(finalWidth)) {
      try {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(finalWidth)));
      } catch {
        // localStorage unavailable; resize still works for the session.
      }
    }
  };

  opts.handle.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp, true);
}

export function loadSidebarWidth(): number | null {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!raw) return null;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return null;
    return clamp(n, SIDEBAR_MIN, SIDEBAR_MAX);
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
