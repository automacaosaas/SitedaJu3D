const paths = {
  pencil: '<path d="m15 4 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-5-5L4 14l-1 7Z"/>',
  lock: '<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v3"/>',
  truck: '<path d="M2 4h12v13H2ZM14 9h4l4 4v4h-8"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
  cart: '<path d="M3 3h2l2.4 12h11.9l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  profile: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  card: '<rect x="2" y="5" width="20" height="15" rx="3"/><path d="M2 10h20M6 15h4M15 15h3"/>',
  pix: '<path d="m9 4 1.6-1.6a2 2 0 0 1 2.8 0L15 4M4 9l-1.6 1.6a2 2 0 0 0 0 2.8L4 15M9 20l1.6 1.6a2 2 0 0 0 2.8 0L15 20M20 9l1.6 1.6a2 2 0 0 1 0 2.8L20 15M5 7h2.5L12 11.5 16.5 7H19M5 17h2.5l4.5-4.5 4.5 4.5H19"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  bag: '<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/>',
  exit: '<path d="M10 3H4v18h6M10 12h11m-4-4 4 4-4 4"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m3 6 9 7 9-7"/>',
  heart: '<path d="M12 21S2 15 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 7-10 13-10 13Z"/>'
};
export function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`; }
