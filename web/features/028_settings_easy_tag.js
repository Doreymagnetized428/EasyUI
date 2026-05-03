/* 028_settings_easy_tag.js — settings (colors always on, no toggle) */
(async function(){
  const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? String(window.API_BASE).replace(/\/+$/, '') : '';
  const defaults = {
    enable_tag_autocomplete: false, // OFF by default
    tag_source_main: '',
    chant_source_main: '',
    tag_include_extra_quality: false,
    enable_chants: true,
    enable_wildcards: true,
    wildcard_style: 'underscores',
  };
  const saved = await (window.EasyTagSettings?.load?.() ?? {});
  window.userSettings = Object.assign({}, defaults, saved);
  // force colors ON
  window.userSettings.enable_tag_colors = true;

  const $ = (id)=>document.getElementById(id);
  const form = document.querySelector('.settings-form') || document.body;

  function append(html){
    const holder = document.createElement('div');
    holder.className = 'easy-tag-settings-row';
    holder.innerHTML = html;
    form.appendChild(holder);
  }

  if (!$('enableTagAutocomplete')) {
    append(`<label>
      <input type="checkbox" id="enableTagAutocomplete">
      <span>تفعيل الإكمال التلقائي للتاقات</span>
    </label>`);
  }
  if (!$('tagSourceSelect')) {
    append(`<label>
      <span>مصدر التاقات:</span>
      <select id="tagSourceSelect"></select>
    </label>`);
  }
  if (!$('chantSourceSelect')) {
    append(`<label>
      <span>مصدر Chants:</span>
      <select id="chantSourceSelect"></select>
    </label>`);
  }
  if (!$('mergeExtraQuality')) {
    append(`<label>
      <input type="checkbox" id="mergeExtraQuality">
      <span>دمج extra-quality-tags</span>
    </label>`);
  }
  if (!$('enableChants')) {
    append(`<label>
      <input type="checkbox" id="enableChants">
      <span>تفعيل Chants (##Chant:key)</span>
    </label>`);
  }
  if (!$('enableWildcards')) {
    append(`<label>
      <input type="checkbox" id="enableWildcards">
      <span>تفعيل Wildcards (__name__)</span>
    </label>`);
  }
  if (!$('wildcardStyle')) {
    append(`<label>
      <span>نمط Wildcards:</span>
      <select id="wildcardStyle">
        <option value="underscores">شرطات سفلية (__name__)</option>
        <option value="braces">أقواس ({name})</option>
      </select>
    </label>`);
  }

  function _sameByBase(a, b){
    const aa = String(a||'').split('/').pop().toLowerCase();
    const bb = String(b||'').split('/').pop().toLowerCase();
    return !!aa && aa === bb;
  }
  function _buildPath(kind, name){
    return `easy-tag/${kind}/${String(name||'').replace(/^\/+/, '')}`;
  }
  async function _fetchList(kind){
    const url = API_BASE + (kind === 'tags' ? '/api/easy-tag/files' : '/api/easy-tag/chant-files');
    const key = kind === 'tags' ? 'tags' : 'chants';
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const arr = Array.isArray(j && j[key]) ? j[key] : [];
      return arr.filter(Boolean);
    } catch (_) {
      return [];
    }
  }
  function _fillSelect(selId, kind, names, preferred){
    const sel = $(selId);
    if (!sel) return;
    const keep = preferred || sel.value || '';

    sel.innerHTML = '';
    const files = Array.isArray(names) ? names : [];
    files.forEach((fname)=>{
      const f = String(fname||'').trim();
      if (!f) return;
      const opt = document.createElement('option');
      opt.value = _buildPath(kind, f);
      opt.textContent = f;
      sel.appendChild(opt);
    });

    let matched = Array.from(sel.options).find(o => _sameByBase(o.value, keep) || o.value === keep);
    if (!matched && keep) {
      const base = String(keep).split('/').pop();
      if (base) {
        const opt = document.createElement('option');
        opt.value = _buildPath(kind, base);
        opt.textContent = base;
        sel.appendChild(opt);
        matched = opt;
      }
    }
    if (matched) sel.value = matched.value;
  }
  async function populateEasyTagSources(){
    const [tagFiles, chantFiles] = await Promise.all([
      _fetchList('tags'),
      _fetchList('chants')
    ]);
    _fillSelect('tagSourceSelect', 'tags', tagFiles, window.userSettings.tag_source_main);
    _fillSelect('chantSourceSelect', 'chants', chantFiles, window.userSettings.chant_source_main);
    if ($('tagSourceSelect')) window.userSettings.tag_source_main = ($('tagSourceSelect').value || '');
    if ($('chantSourceSelect')) window.userSettings.chant_source_main = ($('chantSourceSelect').value || '');
  }

  await populateEasyTagSources();

  // Sync UI
  $('enableTagAutocomplete').checked = !!window.userSettings.enable_tag_autocomplete;
  if ($('tagSourceSelect') && window.userSettings.tag_source_main) {
    const hit = Array.from($('tagSourceSelect').options).find(o => _sameByBase(o.value, window.userSettings.tag_source_main) || o.value === window.userSettings.tag_source_main);
    if (hit) $('tagSourceSelect').value = hit.value;
  }
  if ($('chantSourceSelect') && window.userSettings.chant_source_main) {
    const hit2 = Array.from($('chantSourceSelect').options).find(o => _sameByBase(o.value, window.userSettings.chant_source_main) || o.value === window.userSettings.chant_source_main);
    if (hit2) $('chantSourceSelect').value = hit2.value;
  }
  $('mergeExtraQuality').checked = !!window.userSettings.tag_include_extra_quality;
  $('enableChants').checked = window.userSettings.enable_chants !== false;
  $('enableWildcards').checked = window.userSettings.enable_wildcards !== false;
  $('wildcardStyle').value = window.userSettings.wildcard_style || 'underscores';

  async function persist(reload=false){
    await window.EasyTagSettings.save(window.userSettings);
    document.dispatchEvent(new CustomEvent('easyTagSettingsChanged', { detail: window.userSettings }));
    if (reload) location.reload();
  }

  $('enableTagAutocomplete').addEventListener('change', async (e)=>{
    window.userSettings.enable_tag_autocomplete = e.target.checked;
    await persist(false);
  });
  $('tagSourceSelect').addEventListener('change', async (e)=>{
    window.userSettings.tag_source_main = e.target.value;
    await persist(true);
  });
  if ($('chantSourceSelect')) $('chantSourceSelect').addEventListener('change', async (e)=>{
    window.userSettings.chant_source_main = e.target.value;
    await persist(true);
  });
  $('mergeExtraQuality').addEventListener('change', async (e)=>{
    window.userSettings.tag_include_extra_quality = e.target.checked;
    await persist(true);
  });
  $('enableChants').addEventListener('change', async (e)=>{
    window.userSettings.enable_chants = e.target.checked;
    await persist(false);
  });
  $('enableWildcards').addEventListener('change', async (e)=>{
    window.userSettings.enable_wildcards = e.target.checked;
    await persist(false);
  });
  $('wildcardStyle').addEventListener('change', async (e)=>{
    window.userSettings.wildcard_style = e.target.value;
    await persist(false);
  });
})();
