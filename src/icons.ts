// Small white line icons for the round buttons (24 × 24), in place of words.
// dx, dy shift each drawing so it sits in the middle of its circle (measured from its outline).
const svg = (inner: string, dx = 0, dy = 0) =>
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" ' +
  `stroke-linecap="round" stroke-linejoin="round" style="display:block"><g transform="translate(${dx} ${dy})">${inner}</g></svg>`;

export const ICONS = {
  // a pebble with its arc
  stone: svg('<ellipse cx="7" cy="17.5" rx="4.5" ry="3" fill="#fff"/><path d="M11 13c2.5-6 7-8 10-5" stroke-dasharray="2.5 3"/>', 0.25, -1.56),
  // a paper boat on a wave
  boat: svg('<path d="M3 13h18l-3.5 5h-11z"/><path d="M11 13V4l6 9"/><path d="M3 21c2-1.3 4-1.3 6 0s4 1.3 6 0 4-1.3 6 0"/>', 0, -1),
  // a runner
  run: svg('<circle cx="15" cy="4" r="2" fill="#fff"/><path d="M8 9l4-2 3 3 3 2"/><path d="M12 7l-2 6 4 3-1 5"/><path d="M10 13l-2 4H4"/>', 1, 0.5),
  // someone sitting on a ledge, legs over the edge
  sit: svg('<circle cx="9" cy="4" r="2" fill="#fff"/><path d="M9 8v6h6v6"/><path d="M9 10l4 2"/><path d="M3 15h8"/>', 3, 1),
  done: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 0, -0.25),
};
