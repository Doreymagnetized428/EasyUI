
/* Feature #033 — Chants + Wildcards pipeline (preprocess before send) */
(function(){
  function normalizeChantSource(path){
    var v = String(path || '').trim().replace(/\\/g, '/');
    if (!v) return '';
    var marker = 'easy-tag/chants/';
    var idx = v.toLowerCase().indexOf(marker);
    if (idx >= 0) return marker + v.slice(idx + marker.length).replace(/^\/+/, '');
    var base = v.split('/').pop();
    if (!base) return '';
    if (!/\.json$/i.test(base)) base += '.json';
    return marker + base;
  }
  async function loadJSON(path){
    const res = await fetch(path); if (!res.ok) return null;
    try { return await res.json(); } catch { return null; }
  }
  async function loadText(path){
    const res = await fetch(path); if (!res.ok) return '';
    return await res.text();
  }
  async function loadChantsAll(path) {
    const resolved = normalizeChantSource(path);
    if (!resolved) return {};
    try {
      const data = await loadJSON(resolved);
      return (data && typeof data === 'object') ? data : {};
    } catch {
      return {};
    }
  }
  async function loadWildcardList(name) {
    const txt = await loadText('easy-tag/wildcards/'+name+'.txt');
    return txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  }
  function expandChants(input, chants, enabled=true){
    if (!enabled) return input;
    return input.replace(/(^|\s)##Chant:([\w\-]+)/g, (m, sp, key) => {
      const rep = chants[key] || '';
      return (sp || '') + rep;
    });
  }
  async function expandWildcards(input, style='underscores', enabled=true){
    if (!enabled) return input;
    const pattern = style === 'underscores' ? /__([A-Za-z0-9_\-]+)__/g : /{([A-Za-z0-9_\-]+)}/g;
    const names = new Set(); input.replace(pattern, (_,n)=>{names.add(n);return _;});
    const cache = {}; for (const n of names) cache[n]= await loadWildcardList(n);
    return input.replace(pattern, (_, n) => {
      const list = cache[n] || []; if (!list.length) return _;
      const pick = list[Math.floor(Math.random()*list.length)];
      return pick;
    });
  }
  function tidy(text){ 
    return text
      .replace(/\s*,\s*/g, ', ')           // تنظيف الفواصل
      .replace(/ {2,}/g, ' ')              // استبدال المسافات المتعددة بمسافة واحدة فقط (ليس newlines)
      .replace(/\n\s*\n/g, '\n')           // إزالة الأسطر الفارغة المتعددة
      .trim();                              // إزالة المسافات من البداية والنهاية
  }

  // Expose one function
  window.preprocessPrompt = async function(raw, settings){
    let s = raw;
    const chants = settings?.enable_chants ? await loadChantsAll(settings?.chant_source_main) : {};
    if (settings?.enable_chants) s = expandChants(s, chants, true);
    if (settings?.enable_wildcards) s = await expandWildcards(s, settings?.wildcard_style || 'underscores', true);
    return tidy(s);
  };
})();
