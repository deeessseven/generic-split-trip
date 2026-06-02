// Device pixel ratio used for hi-DPI rendering. Capped to keep phone fill-rate sane
// (a DPR of 3 already means 9× the pixels of a 1× canvas).
export function renderDpr() {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return Math.min(Math.max(dpr, 1), 3);
}
