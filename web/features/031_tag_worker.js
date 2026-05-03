
/* Feature #031 — Tag search worker (primed by main thread) */
let TAGS = [];
function norm(s){ return (s||'').toString().toLowerCase(); }

self.onmessage = (ev) => {
  const { type, payload } = ev.data || {};
  if (type === 'prime') {
    TAGS = (payload && Array.isArray(payload.items)) ? payload.items.map(x => ({
      name: x.name || '', lname: norm(x.name||''),
      count: x.count ?? undefined, aliases: (x.aliases||[]).slice(0,3),
      type: x.type ?? x.categoryId ?? undefined
    })) : [];
    self.postMessage({ type:'ready', size: TAGS.length });
  }
  else if (type === 'search') {
    const q = norm(payload?.q || '');
    const limit = payload?.limit ?? 30;
    if (!q) return self.postMessage({type:'results', items: []});
    const starts = [], wordStart = [], contains = [];
    for (const t of TAGS) { if (t.lname.startsWith(q)) { starts.push(t); if (starts.length>=limit) break; } }
    if (starts.length < limit) {
      for (const t of TAGS) { if (t.lname.includes(' '+q)) { wordStart.push(t); if (starts.length+wordStart.length>=limit) break; } }
    }
    if (starts.length + wordStart.length < limit) {
      for (const t of TAGS) { if (t.lname.includes(q)) { contains.push(t); if (starts.length+wordStart.length+contains.length>=limit) break; } }
    }
    const items = [...starts, ...wordStart, ...contains].slice(0, limit);
    self.postMessage({ type:'results', items });
  }
};
