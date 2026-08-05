// ui/icons.js — the small symbol set achievements are drawn with.
//
// Inline SVG rather than image files: the game ships no assets and no runtime
// dependencies, and a symbol that is markup can be recoloured by CSS to show
// whether an achievement is earned or still locked.
//
// Deliberately crude. These render at 30 pixels inside a plaque, so anything
// with detail turns to mud — each is two or three shapes that read instantly
// at that size.

const PATHS = {
  skull: '<path d="M12 2C7 2 4 5.4 4 10c0 2.4 1 4 2.4 5.2V19h3v-2h1.2v2h2.8v-2H15v2h3v-3.8C19.2 14 20 12.4 20 10c0-4.6-3-8-8-8Z"/>'
    + '<circle cx="9" cy="10.5" r="1.9" fill="#0b0b0f"/><circle cx="15" cy="10.5" r="1.9" fill="#0b0b0f"/>',
  sword: '<path d="M18.5 2 21 4.5 10.8 14.7 8.5 12.4 18.5 2Z"/>'
    + '<path d="M7.6 13.3 10 15.7 8.3 17.4l1.2 1.2-1.5 1.5-1.2-1.2-1.5 1.5-2-2 1.5-1.5-1.2-1.2 1.5-1.5 1.2 1.2 1.3-1.7Z"/>',
  shield: '<path d="M12 2 4 5v7c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V5l-8-3Z"/>'
    + '<path d="M12 6.5 8 8v4c0 2.7 1.7 4.6 4 5.6 2.3-1 4-2.9 4-5.6V8l-4-1.5Z" fill="#0b0b0f" opacity=".45"/>',
  crown: '<path d="M3 8l3.5 3L12 4l5.5 7L21 8l-1.6 10H4.6L3 8Z"/><rect x="4.6" y="19" width="14.8" height="2.4" rx="1"/>',
  chest: '<path d="M3 10a9 9 0 0 1 18 0v2H3v-2Z"/><path d="M3 13h18v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7Z"/>'
    + '<rect x="10.6" y="9" width="2.8" height="6" rx="1.2" fill="#0b0b0f" opacity=".6"/>',
  hammer: '<path d="M13.5 2 21 9.5l-3 3-2.2-2.2L6.4 19.7a2 2 0 0 1-2.8-2.8L13 7.7 10.5 5l3-3Z"/>',
  flask: '<path d="M10 2h4v6.2l4.6 9.1A3 3 0 0 1 15.9 22H8.1a3 3 0 0 1-2.7-4.7L10 8.2V2Z"/>'
    + '<path d="M7.6 15h8.8l1.3 2.6H6.3L7.6 15Z" fill="#0b0b0f" opacity=".45"/>',
  banner: '<path d="M5 2h14v15l-7-4-7 4V2Z"/><path d="M9 6h6v2H9V6Z" fill="#0b0b0f" opacity=".5"/>'
    + '<rect x="11" y="17" width="2" height="5" rx="1"/>',
  star: '<path d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8L12 2Z"/>',
  tower: '<path d="M6 8h12v13H6V8Z"/><path d="M5 4h3v4H5V4Zm5.5 0h3v4h-3V4ZM16 4h3v4h-3V4Z"/>'
    + '<rect x="10.6" y="14" width="2.8" height="7" rx="1.2" fill="#0b0b0f" opacity=".55"/>',
  coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.4" fill="#0b0b0f" opacity=".4"/>',
  scroll: '<path d="M5 3h11a3 3 0 0 1 3 3v13a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3V6a3 3 0 0 1 2-3Z"/>'
    + '<path d="M7 8h9v1.8H7V8Zm0 4h9v1.8H7V12Zm0 4h6v1.8H7V16Z" fill="#0b0b0f" opacity=".55"/>',
  anvil: '<path d="M3 8h11c0 2.6-1.4 3.9-3 4.4V14h6V8.6L21 8v6.6c0 1.4-1.2 2.4-2.6 2.4H8.4L6 21H4l2-4H3V8Z"/>',
  boot: '<path d="M6 2h5v9.5c0 1.6.9 2.4 2.4 3l5.2 2.1A3 3 0 0 1 20.4 20v2H6V2Z"/>',
};

/** Every symbol id, so a test can check nothing references a missing one. */
export const ICON_IDS = Object.keys(PATHS);

/**
 * An inline SVG symbol.
 * @param {string} id   one of ICON_IDS
 * @param {string} cls  extra classes for the <svg>
 */
export function icon(id, cls = '') {
  const body = PATHS[id] ?? PATHS.star;
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}
