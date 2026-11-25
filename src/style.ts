/// <reference types="vite/client" />
// The look of every button and label (Hoon's pick: "Glass"): Quicksand, white text, frosted see-through pills.
// The font ships with the site (no calls to a font service).
import '@fontsource/quicksand/500.css';
import '@fontsource/quicksand/700.css';

export const FONT = "font-family:Quicksand,system-ui,sans-serif;";
// White text with a soft shadow, readable over the bright sky and the dark ground alike.
export const LIGHT_TEXT = `${FONT}font-weight:700;color:#fff;text-shadow:0 1px 3px #0007;`;
export const GLASS =
  'border:1.5px solid #ffffffb8;border-radius:999px;background:#ffffff2e;' +
  '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);' + `${LIGHT_TEXT}font-size:15px;`;
