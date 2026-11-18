const paths = {
  layers: '<path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  folder: '<path d="M3 8V5h6l2 3h10v11H3z"/>',
  tag: '<path d="M3 4h8l10 10-7 7L3 10z"/><circle cx="7.5" cy="7.5" r="1"/>',
  book: '<path d="M3 5c4-1 6 0 9 2 3-2 5-3 9-2v14c-4-1-6 0-9 2-3-2-5-3-9-2zM12 7v14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 15a8.5 8.5 0 0 1-11-11 9 9 0 1 0 11 11Z"/>',
  box: '<path d="m3 7 9-5 9 5v10l-9 5-9-5zM3 7l9 5 9-5m-9 5v10m-5-17 9 5"/>',
  link: '<path d="m9 15 6-6m-5-1 2-2a4.5 4.5 0 0 1 7 7l-2 2m-3 1-2 2a4.5 4.5 0 0 1-7-7l2-2"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  branch:
    '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 7v10m0-4c7 0 12-1 12-5"/>',
  'up-right': '<path d="M6 17 17 6M7 6h10v10"/>',
  shield: '<path d="m12 2 8 3v6c0 5-3 8-8 11-5-3-8-6-8-11V5z"/><path d="m8.5 11.5 2.5 2.5 4.5-5"/>',
  sliders:
    '<path d="M3 6h6m5 0h7M3 12h11m5 0h2M3 18h2m5 0h11"/><circle cx="11.5" cy="6" r="2"/><circle cx="16.5" cy="12" r="2"/><circle cx="7.5" cy="18" r="2"/>',
  zip: '<path d="M5 2h9l5 5v15H5zM14 2v6h5M9 4v2m2 0v2m-2 0v2m2 0v2m-2 0v2"/><rect x="8" y="15" width="4" height="3" rx="1"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  compress: '<path d="m3 3 6 6M4 9h5V4m12 17-6-6m0 5v-5h5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  list: '<path d="M8 6h13M8 12h10M8 18h13M3 6h1m-1 6h1m-1 6h1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  files: '<path d="M8 3h8l5 5v12H8zM16 3v6h5M4 7H3v16h13M11 13h7m-7 3h5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  terminal: '<path d="m3 6 6 6-6 6m9 0h8"/>',
  route:
    '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h9a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h9"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 4 2.2c-1.2.7-1.5 1.2-1.5 2.8m0 3h.01"/>',
};
export function icon(name) {
  return (
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' +
    paths[name] +
    '</svg>'
  );
}
