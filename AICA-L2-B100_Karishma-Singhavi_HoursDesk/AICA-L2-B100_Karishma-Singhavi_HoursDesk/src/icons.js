const paths = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  timesheets: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  schedule: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 18h3M15 14h2"/>',
  leave: '<path d="M4 18c3-1 5-3 8-7 2-3 4-4 8-5M4 18c5 1 8 0 11-3M4 18l2-5"/><circle cx="18" cy="6" r="2"/>',
  corrections: '<path d="M4 20h16M6 16l9.5-9.5 3 3L9 19H6zM13.5 8.5l3 3"/>',
  team: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2H3zM16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1h-4"/>',
  projects: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/>',
  reports: '<path d="M4 20V11M10 20V5M16 20v-8M22 20V8M2 20h22"/>',
  settings: '<path d="M10 3h4l.5 2.2 1.7.8 2-1.1 2.8 2.8-1.1 2 .8 1.7L23 12v4l-2.2.5-.8 1.7 1.1 2-2.8 2.8-2-1.1-1.7.8L14 25h-4l-.5-2.2-1.7-.8-2 1.1L3 20.3l1.1-2-.8-1.7L1 16v-4l2.2-.5.8-1.7-1.1-2L5.7 5l2 1.1 1.7-.8z" transform="translate(0 -1) scale(.92)"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.7"/><path d="m16 16 4.5 4.5"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  arrow: '<path d="M5 19 19 5M8 5h11v11"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  logout: '<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M13 7l5 5-5 5M7 12h11"/>'
};

export function icon(name, size = 18) {
  return `<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.dashboard}</svg>`;
}

export const logoMark = `<svg class="logo-mark" width="36" height="36" viewBox="0 0 44 44" fill="none" role="img" aria-label="HoursDesk logo"><defs><linearGradient id="hoursdeskGradient" x1="3" y1="3" x2="41" y2="41" gradientUnits="userSpaceOnUse"><stop stop-color="#62C6F9"/><stop offset="1" stop-color="#2477DA"/></linearGradient></defs><rect x="1" y="1" width="42" height="42" rx="13" fill="url(#hoursdeskGradient)"/><path d="M13 11v22M31 11v22M13 22h18" stroke="white" stroke-width="4.4" stroke-linecap="round"/><circle cx="31" cy="11" r="3" fill="#D6F5FF"/></svg>`;
