export function createEmptyData(user) {
  const name = user?.user_metadata?.full_name?.trim() || user?.email?.split('@')[0] || 'Workspace owner';
  const initials = name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
  return {
    version: 2,
    people: [{ id: user.id, name, email: user.email, role: 'Workspace owner', team: 'Leadership', initials, color: '#dbeaf5', status: 'Off shift' }],
    projects: [], shifts: [], entries: [], leave: [], corrections: [], activity: [],
    settings: {
      company: user?.user_metadata?.company?.trim() || `${name}'s workspace`,
      timezone: 'Asia/Kolkata', workday: 8, overtime: 40,
      allowSelfClock: true, requireApproval: true, emailAlerts: false
    },
    clock: { state: 'out', since: null, projectId: null, breakStarted: null, breakMinutes: 0 }
  };
}

export function removeLegacyDemoData(previous, user) {
  if (previous?.version === 2) return previous;
  const clean = createEmptyData(user);
  const known = {
    people: new Set(['p1','p2','p3','p4','p5','p6']),
    projects: new Set(['pr1','pr2','pr3']),
    shifts: new Set(['s1','s2','s3','s4','s5','s6','s7','s8']),
    entries: new Set(['e1','e2','e3','e4','e5']),
    leave: new Set(['l1','l2','l3'])
  };
  for (const key of Object.keys(known)) {
    clean[key] = (previous?.[key] || []).filter(item => !known[key].has(item.id));
  }
  if (!clean.people.some(item => item.id === user.id)) clean.people.unshift(createEmptyData(user).people[0]);
  clean.shifts = clean.shifts.filter(shift => !!shift.date);
  clean.corrections = previous?.corrections || [];
  clean.settings = { ...clean.settings, ...(previous?.settings || {}) };
  clean.activity = [];
  return clean;
}
