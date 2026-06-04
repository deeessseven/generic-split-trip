// Shrink a Text object's font size so it fits within maxW (and maxH if given). Used so custom
// gametext.txt strings — which can be far longer than the built-in defaults — never overflow their
// layout. No-op when the text already fits. Returns the same text object (chainable).
export function fitText(t, maxW, maxH) {
  const px = parseInt(t.style.fontSize, 10);
  if (!px) return t;
  let s = 1;
  if (maxW && t.width  > maxW) s = Math.min(s, maxW / t.width);
  if (maxH && t.height > maxH) s = Math.min(s, maxH / t.height);
  if (s < 1) t.setFontSize(Math.max(6, Math.floor(px * s)));
  return t;
}
