
// --- Path normalization helpers to build correct tag file URLs ---
function buildApiBase(){
  var b = (typeof window !== 'undefined' && window.API_BASE) ? String(window.API_BASE) : '';
  return b.replace(/\/+$/, '');
}
function normalizeTagPath(p){
  if (!p) return p;
  if (/^https?:\/\//i.test(p)) return p;
  var base = buildApiBase();
  if (p[0] === '/') return base + p;
  if (p.indexOf('easy-tag/') === 0) return base + '/' + p;
  return base + '/easy-tag/tags/' + p;
}
function normalizeTagSourcePath(p){
  var v = String(p || '').trim().replace(/\\/g, '/');
  if (!v) return '';

  var lv = v.toLowerCase();
  var marker = 'easy-tag/tags/';
  var idx = lv.indexOf(marker);
  if (idx >= 0) {
    v = marker + v.slice(idx + marker.length).replace(/^\/+/, '');
  } else {
    v = marker + v.split('/').pop();
  }

  if (/\.csv$/i.test(v)) v = v.replace(/\.csv$/i, '.json');
  if (!/\.json$/i.test(v)) v += '.json';
  return v;
}
function normalizeChantSourcePath(p){
  var v = String(p || '').trim().replace(/\\/g, '/');
  if (!v) return '';

  var lv = v.toLowerCase();
  var marker = 'easy-tag/chants/';
  var idx = lv.indexOf(marker);
  if (idx >= 0) {
    v = marker + v.slice(idx + marker.length).replace(/^\/+/, '');
  } else {
    v = marker + v.split('/').pop();
  }

  if (!/\.json$/i.test(v)) v += '.json';
  return v;
}
/* 032_tag_autocomplete.js — supports tags + chants + wildcards with colors */
(function(){
  const mainInput = document.getElementById('mainInput');
  if (!mainInput) { console.warn('[easy-tag] #mainInput not found'); return; }

  // Settings
  const saved = (()=>{ try { return JSON.parse(localStorage.getItem((window.EasyTagSettings?.key?.()||'easyTagSettings:guest'))||'{}'); } catch { return {}; } })();
  window.userSettings = Object.assign({
    enable_tag_autocomplete: false,
    tag_source_main: '',
    chant_source_main: '',
    tag_include_extra_quality: false,
    enable_chants: true,      // مفعّل افتراضياً
    enable_wildcards: true    // مفعّل افتراضياً
  }, window.userSettings || saved);
  window.userSettings.tag_source_main = normalizeTagSourcePath(window.userSettings.tag_source_main);
  window.userSettings.chant_source_main = normalizeChantSourcePath(window.userSettings.chant_source_main);
  window.userSettings.enable_tag_colors = true;

  // Helpers
  function unique(a){ return [...new Set(a)]; }
  function toCandidates(path){
    path = String(path).replace(/\\/g,'/'); const base = path.replace(/^\.\//,'');
    return unique([
      base,
      '/'+base,
      '/static/'+base.replace(/^\/+/,''),
      '/web/'+base.replace(/^\/+/,''),
      base.replace(/^.*easy-tag\//,'easy-tag/'),
      '/'+base.replace(/^.*easy-tag\//,'easy-tag/')
    ]);
  }
  async function tryFetchJSON(paths){
    for (const u of paths) {
      try {
        const r = await fetch(u);
        if (r.ok) return {json:await r.json(), url:u};
      } catch {}
    }
    return null;
  }

  // ── chants: اسم ملف قصير → easy-tag/chants/*.json ────────────────
  function resolveChantPath(x){
    let p = String(x||'').trim();
    if (!p) return null;
    if (!/[\/\\]/.test(p)) p = 'easy-tag/chants/' + p;
    if (!/\.json$/i.test(p)) p += '.json';
    return p;
  }

  function normalizeChants(arr){
    if (!Array.isArray(arr)) return [];
    return arr.map(x => ({
      name: x?.name || '',
      lname: (x?.name||'').toLowerCase(),
      terms: (typeof x?.terms === 'string'
                ? x.terms.split(',').map(s=>s.trim()).filter(Boolean)
                : (Array.isArray(x?.terms)? x.terms : []))
                .map(s=>String(s||'').toLowerCase()),
      content: x?.content || '',
      color: (x?.color ?? null)
    })).filter(x => x.name && x.content);
  }
  async function loadChants(path){
    const resolved = resolveChantPath(path);
    if (!resolved) return [];
    const r = await tryFetchJSON(toCandidates(resolved));
    if (r) { window.__easyChant_lastURL = r.url; return normalizeChants(r.json); }
    console.warn('[easy-tag] chants file not found at', resolved);
    return [];
  }

  function normalizeList(arr){
    if (!Array.isArray(arr)) return [];
    return arr.map(x => ({
      name: x?.name || '',
      lname: (x?.name||'').toLowerCase(),
      type: (x?.type ?? null),
      count: (x?.count ?? null),
      aliases: Array.isArray(x?.aliases) ? x.aliases : []
    })).filter(x => x.name);
  }
  async function loadSmart(path){
    if (!path) return [];
    const r = await tryFetchJSON(toCandidates(path));
    if (r) { window.__easyTag_lastURL = r.url; return normalizeList(r.json); }
    return [];
  }
  async function loadAllTags(){
    const src = window.userSettings.tag_source_main;
    let list = await loadSmart(src);
    if (window.userSettings.tag_include_extra_quality) {
      const extra = await loadSmart('easy-tag/tags/extra-quality-tags.json');
      const by = new Map(list.map(t => [t.name, t]));
      for (const t of extra) by.set(t.name, Object.assign({}, by.get(t.name)||{}, t));
      list = Array.from(by.values());
    }
    return list;
  }

  // ── wildcards: جلب قائمة الأسماء من _manifest.json فقط ────────
  async function loadWildcardNames() {
    // 1) كاش محلي (ذو إصدار)
    try {
      const cached = JSON.parse(localStorage.getItem('easyWildcardManifest') || '{}');
      if (cached && Array.isArray(cached.list) && cached.version) {
        return cached.list;
      }
    } catch {}
  
    // 2) مانيـفِست ثابت في المجلد
    try {
      const r = await fetch('/easy-tag/wildcards/_manifest.json', { cache: 'no-cache' });
      if (r.ok) {
        const j = await r.json();
        const raw = Array.isArray(j?.wildcards) ? j.wildcards : (Array.isArray(j) ? j : []);
        const names = raw
          .map(s => String(s).split('/').pop())
          .map(n => n.replace(/\.txt$/i, ''));
        const uniqueSorted = [...new Set(names)].sort();
  
        // خزّن بصيغة جديدة + متوافق خلفياً مع المفتاح القديم
        try {
          localStorage.setItem('easyWildcardManifest', JSON.stringify({
            version: j.version || j.updated || String(uniqueSorted.length),
            list: uniqueSorted
          }));
          localStorage.setItem('easyWildcardKnownFiles', JSON.stringify(uniqueSorted));
        } catch {}
  
        return uniqueSorted;
      }
    } catch {}
  
    // 3) كاش قديم (توافق خلفي)
    try {
      const c = JSON.parse(localStorage.getItem('easyWildcardKnownFiles') || '[]');
      if (Array.isArray(c) && c.length) return c;
    } catch {}
  
    console.warn('[easy-tag] wildcard names manifest not found');
    return [];
  }
  

  // Worker
  const WORKER = `
    let CHANTS = [];
    let TAGS = [];
    let WILDS = [];
    const norm = s => (s||'').toString().toLowerCase();
    function startsWithAny(arr, q){ for (const a of arr||[]) { if (norm(a).startsWith(q)) return true; } return false; }

    onmessage = (ev) => {
      const { type, payload } = ev.data || {};
      if (type === 'prime') {
        CHANTS = Array.isArray(payload?.chants)
          ? payload.chants.map(x => ({
              name:x.name||'',
              lname:(x.name||'').toLowerCase(),
              terms:(Array.isArray(x.terms)? x.terms:[]).map(t=>String(t||'').toLowerCase()),
              content:x.content||'',
              color:(x.color ?? null)
            }))
          : [];
        TAGS = Array.isArray(payload?.items)
          ? payload.items.map(x => ({
              name:x.name||'',
              lname: norm(x.name||''),
              count:(x.count ?? null),
              aliases:(x.aliases||[]),
              type:x.type ?? null
            }))
          : [];
        WILDS = Array.isArray(payload?.wilds)
          ? payload.wilds.map(n => ({ name:String(n||''), lname: norm(n) }))
          : [];
        postMessage({ type:'ready', size:TAGS.length, wilds:WILDS.length });
      } else if (type === 'search') {
        const mode = payload?.mode || 'tags';
        const q = norm(payload?.q || '');

        // wildcards: لو q فاضي → رجّع الكل (عرض كامل)
        if (mode==='wildcards') {
          if (!q) { postMessage({ type:'results', items: WILDS.slice(), mode:'wildcards' }); return; }
          const starts=[], contains=[];
          for (const w of WILDS) {
            if (w.lname.startsWith(q)) starts.push(w);
            else if (w.lname.includes(q)) contains.push(w);
          }
          postMessage({ type:'results', items: starts.concat(contains), mode:'wildcards' });
          return;
        }

        if (!q) { postMessage({type:'results', items: [], mode}); return; }

        const hard = [], soft = [];
        if (mode==='chants') {
          for (const c of CHANTS){
            const sw = c.lname.startsWith(q) || (c.terms||[]).some(tt => tt.startsWith(q));
            const ic = c.lname.includes(q) || (c.terms||[]).some(tt => tt.includes(q));
            if (sw) hard.push(c); else if (ic) soft.push(c);
          }
          postMessage({ type:'results', items: hard.length ? hard.slice(0,10) : soft.slice(0,10), mode:'chants' });
          return;
        }

        for (const t of TAGS) {
          if (t.lname.startsWith(q) || startsWithAny(t.aliases, q)) hard.push(t);
          else if (t.lname.includes(q) || (t.aliases||[]).some(a => norm(a).includes(q))) soft.push(t);
        }
        postMessage({ type:'results', items: hard.length ? hard : soft, mode:'tags' });
      }
    };
  `;
  const worker = new Worker(URL.createObjectURL(new Blob([WORKER], {type:'application/javascript'})));

  // Popup UI
  let items=[], lastQ='', sel=0, dropdown, primed=false;
  function ensureDropdown(){
    if (dropdown) return;
    dropdown = document.createElement('div');
    dropdown.className = 'easy-tag-popup';
    const css = document.createElement('style');
    css.textContent = `
      .easy-tag-popup{
        position:fixed;z-index:9999;display:none;background:#fff;border:1px solid rgba(0,0,0,.08);
        border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.12);padding:6px;white-space:nowrap;max-width:90vw;
        max-height:60vh; overflow:auto; box-sizing:border-box;
      }
      .easy-tag-row{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;padding:7px 10px;border-radius:8px;cursor:pointer}
      .easy-tag-row:hover{background:#f6f9ff}
      .easy-tag-row[data-sel="1"]{background:#eaf2ff}
      .easy-tag-count{width:56px; text-align:left; font-size:12px; color:#697386;}
      .easy-tag-name{font-weight:500}
      .easy-tag-empty{padding:8px;opacity:.7}
      .easy-tag-qlabel{width:56px; text-align:left; font-size:12px; color:#697386;}
    `;
    document.head.appendChild(css);
    document.body.appendChild(dropdown);
  }

  function kfmt(n){
    if (n === null || n === undefined) return '';
    const x=Number(n||0);
    if (x>=1e6) return (Math.round(x/1e6*10)/10)+'M';
    if (x>=1e3) return Math.round(x/1e3)+'K';
    return String(x);
  }

  const TYPE_COLORS = { 0:'#1677ff', 1:'#a855f7', 2:'#10b981', 3:'#06b6d4', 4:'#f59e0b', 5:'#ef4444' };
  function setColorOn(el, it){
    let color = '#1677ff'; // default
    try{
      if (typeof window.resolveTagColor === 'function' && it && it.type !== null && it.type !== undefined){
        const c = window.resolveTagColor(it.type, true);
        if (c && typeof c === 'object'){
          color = c.bg || c.fg || color;
        }
      }
      if (it.color != null) {
        const t = Number(it.color);
        if (!Number.isNaN(t) && Object.prototype.hasOwnProperty.call(TYPE_COLORS, t)) color = TYPE_COLORS[t];
      }
    }catch(e){}
    el.style.color = color;
  }

  function showAbove(anchor){
    const r = anchor.getBoundingClientRect();
    const vv = window.visualViewport;
    const vw = Math.max(0, Math.round((vv && vv.width) || window.innerWidth || document.documentElement.clientWidth || 0));
    const vh = Math.max(0, Math.round((vv && vv.height) || window.innerHeight || document.documentElement.clientHeight || 0));
    const margin = 8;

    // Keep popup width bounded to viewport so it cannot stretch the page on mobile.
    dropdown.style.maxWidth = Math.max(220, vw - margin * 2) + 'px';
    dropdown.style.visibility='hidden';
    dropdown.style.display='inline-block';
    const w = dropdown.offsetWidth || 0;
    const h = dropdown.offsetHeight || 0;
    dropdown.style.visibility='visible';

    let left = Math.round(r.left);
    if (left + w > vw - margin) left = vw - w - margin;
    if (left < margin) left = margin;

    // Prefer above input; fall back below if space is tight.
    let top = Math.round(r.top - h - 10);
    if (top < margin) top = Math.round(r.bottom + 8);
    if (top + h > vh - margin) top = vh - h - margin;
    if (top < margin) top = margin;

    dropdown.style.left = left + 'px';
    dropdown.style.top  = top + 'px';
  }
  function hide(){ if(dropdown) dropdown.style.display='none'; sel=0; items=[]; }
  function move(d){ sel=(sel+d+items.length)%Math.max(items.length,1); highlight(); }
  function highlight(){
    let iRow=0;
    for (const el of dropdown.children){
      if(el.classList?.contains('easy-tag-row')){
        el.setAttribute('data-sel', (iRow===sel)?'1':'0'); iRow++;
      }
    }
  }

  function displayText(it, q){
    const ql=(q||'').toLowerCase();
    if (it.aliases){
      const aliasHit=(it.aliases||[]).find(a=>a && a.toLowerCase().startsWith(ql));
      if (aliasHit && aliasHit.toLowerCase()!==it.lname) return `${aliasHit} \u2192 ${it.name}`;
    }
    return it.name;
  }

  function render(q){
    const mode = (typeof lastMode==='string') ? lastMode : 'tags';
    ensureDropdown();
    dropdown.innerHTML = '';

    if (!items.length){
      const em = document.createElement('div');
      em.className='easy-tag-empty';
      em.textContent = (window.t ? window.t('tags.no_results', 'لا توجد نتائج') : 'لا توجد نتائج');
      dropdown.appendChild(em);
      showAbove(mainInput); return;
    }

    if (mode==='wildcards'){
      // اعرض الكل بلا حد
      items.forEach((it, idx)=>{
        const row = document.createElement('div'); row.className='easy-tag-row';
        if (idx===sel) row.setAttribute('data-sel','1');
        row.onmouseenter=()=>{ sel=idx; highlight(); };
        row.onmousedown=(e)=>{ e.preventDefault(); sel=idx; apply(it); };

        const left = document.createElement('div');
        left.className = 'easy-tag-qlabel';
        left.textContent = '__';

        const right = document.createElement('div');
        const nameSpan = document.createElement('span'); nameSpan.className='easy-tag-name';
        nameSpan.textContent = it.name;
        right.appendChild(nameSpan);

        row.appendChild(left); row.appendChild(right); dropdown.appendChild(row);
      });
      showAbove(mainInput);
      return;
    }

    const counted = (mode==='chants') ? items.slice() : items.filter(it => Number(it.count));
    const LIMIT = (mode==='chants' ? 10 : 5);

    const topCounted = counted
      .slice()
      .sort((a,b)=> (Number(b.count||0))-(Number(a.count||0)))
      .slice(0, LIMIT);

    topCounted.forEach((it, idx)=>{
      const row = document.createElement('div'); row.className='easy-tag-row';
      if (idx===sel) row.setAttribute('data-sel','1');
      row.onmouseenter=()=>{ sel=idx; highlight(); };
      row.onmousedown=(e)=>{ e.preventDefault(); sel=idx; apply(it); };

      const left = document.createElement('div');
      left.className = (mode==='chants' ? 'easy-tag-qlabel' : 'easy-tag-count');
      left.textContent = (mode==='chants' ? '' : kfmt(it.count));

      const right = document.createElement('div');
      const nameSpan = document.createElement('span'); nameSpan.className='easy-tag-name';
      nameSpan.textContent = displayText(it, q);
      if (mode==='chants') { setColorOn(nameSpan, { color: it.color }); } else { setColorOn(nameSpan, it); }
      right.appendChild(nameSpan);

      row.appendChild(left); row.appendChild(right); dropdown.appendChild(row);
    });

    showAbove(mainInput);
  }

  function currentToken(input){
    const val=input.value; const pos=input.selectionStart??val.length;
    let start = val.lastIndexOf(',', pos-1)+1;
    start = Math.max(start, val.lastIndexOf('\n', pos-1)+1, 0);
    let end = val.indexOf(',', pos); if (end===-1) end=val.indexOf('\n', pos); if (end===-1) end=pos;
    const token = val.slice(start, pos).trim(); return {token, start, end:pos};
  }

  function apply(pick){
    const {start, end} = currentToken(mainInput);
    const val=mainInput.value; const before=val.slice(0,start); const after=val.slice(end);
    const insertion =
      (lastMode==='chants')
        ? (pick?.content || (items[sel]||{}).content || '')
        : (lastMode==='wildcards')
          ? ('__' + (pick?.name || (items[sel]||{}).name || '') + '__')
          : (pick?.name || (items[sel]||{}).name || '');
    mainInput.value = before + insertion + after;
    const caret = before.length + insertion.length; mainInput.setSelectionRange(caret, caret);
    hide(); mainInput.dispatchEvent(new Event('input', {bubbles:true}));
  }

  let lastMode='tags';
  worker.onmessage = (ev)=>{
    const {type, items:its, mode} = ev.data || {};
    if (type==='results'){ items = its || []; lastMode = mode || 'tags'; render(lastQ); }
  };

  document.addEventListener('click', (e)=>{ if (dropdown && !dropdown.contains(e.target) && e.target !== mainInput) dropdown.style.display='none'; }, true);

  mainInput.addEventListener('input', async ()=>{
    if (!window.userSettings?.enable_tag_autocomplete){ if(dropdown) dropdown.style.display='none'; return; }
    if (!primed){
      const list = await loadAllTags();
      let chants = [];
      if (window.userSettings?.chant_source_main) { chants = await loadChants(window.userSettings.chant_source_main); }
      const wilds = await loadWildcardNames();
      primed = list.length>0 || chants.length>0 || wilds.length>0;
      worker.postMessage({type:'prime', payload:{items:list, chants:chants, wilds:wilds}});
    }
    const {token} = currentToken(mainInput);
    if (!token){ if(dropdown) dropdown.style.display='none'; return; }
    if (token === lastQ) return; lastQ = token;

    // wildcards: يدعم "__" حتى لو لم يُدخل شيء بعده
    const isChant = token.startsWith('##');
    const isWild  = token.startsWith('__');

    // تحقق من الإعدادات
    if (isChant && window.userSettings?.enable_chants === false) {
      if(dropdown) dropdown.style.display='none';
      return;
    }
    if (isWild && window.userSettings?.enable_wildcards === false) {
      if(dropdown) dropdown.style.display='none';
      return;
    }

    worker.postMessage({
      type:'search',
      payload:{
        q: (isChant ? token.slice(2) : isWild ? token.slice(2).replace(/_+$/,'') : token),
        mode: (isChant ? 'chants' : isWild ? 'wildcards' : 'tags')
      }
    });
  });

  mainInput.addEventListener('keydown', (e)=>{
    if (e.key==='ArrowDown'){ e.preventDefault(); move(1); render(lastQ); }
    else if (e.key==='ArrowUp'){ e.preventDefault(); move(-1); render(lastQ); }
    else if ((e.key==='Enter' || e.key==='Tab') && dropdown && dropdown.style.display !== 'none' && items.length){ e.preventDefault(); apply(items[sel]); }
    else if (e.key==='Escape'){ if(dropdown) dropdown.style.display='none'; }
  });

  document.addEventListener('easyTagSettingsChanged', async (ev)=>{
    window.userSettings = Object.assign({}, window.userSettings, ev.detail||{});
    window.userSettings.tag_source_main = normalizeTagSourcePath(window.userSettings.tag_source_main);
    window.userSettings.chant_source_main = normalizeChantSourcePath(window.userSettings.chant_source_main);
    window.userSettings.enable_tag_colors = true;
    primed=false; hide();
  });
})();
