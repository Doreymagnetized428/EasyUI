
/* Feature #030 — Tags loader (JSON-first + CSV fallback) */
(function(){
  function toJSONPath(path){
    // if ends with .csv → switch to .json
    if (/\.csv$/i.test(path)) return path.replace(/\.csv$/i, '.json');
    // if no ext, assume .json
    if (!/\.(csv|json)$/i.test(path)) return path + '.json';
    return path;
  }

  function candidatesFor(path){
    const cand = [];
    cand.push(path);
    cand.push(path.replace(/^\.\//,''));
    if (!path.startsWith('/')) cand.push('/'+path.replace(/^\.\//,''));
    if (!path.startsWith('/static/')) cand.push('/static/'+path.replace(/^\/+/,'').replace(/^\.\//,''));
    const p2 = path.replace(/^.*easy-tag\//,'easy-tag/');
    cand.push(p2);
    if (!p2.startsWith('/')) cand.push('/'+p2);
    return [...new Set(cand)];
  }

  async function tryFetchJSON(paths){
    for (const u of paths) {
      try {
        const res = await fetch(u, {cache:'no-cache'});
        if (res.ok) return { json: await res.json(), url: u };
      } catch (e) {}
    }
    return null;
  }

  async function tryFetchText(paths){
    for (const u of paths) {
      try {
        const res = await fetch(u, {cache:'no-cache'});
        if (res.ok) return { text: await res.text(), url: u };
      } catch (e) {}
    }
    return null;
  }

  function stripBOM(s){ return s && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

  function parseCSV(text){
    const out = [];
    const lines = stripBOM(text).split(/\r?\n/);
    for (let i=0;i<lines.length;i++){
      let ln = lines[i];
      if (!ln || /^\s*$/.test(ln)) continue;
      if (ln.startsWith('#')) continue;
      if (i===0 && /name|tag/i.test(ln) && /type|category/i.test(ln)) continue;
      let name='', type='', count='', aliases='';
      const m = ln.match(/^(?:"([^"]+)"|([^,]*)),([^,]*),([^,]*),(?:"([^"]*)"|([^,]*))$/)
             || ln.match(/^(?:"([^"]+)"|([^,]*)),([^,]*),?([^,]*),?(.*)$/);
      if (m){
        name = (m[1] ?? m[2] ?? '').trim();
        type = (m[3] ?? '').trim();
        count = (m[4] ?? '').trim();
        aliases = (m[5] ?? m[6] ?? '').trim();
      } else {
        const parts = ln.split(',');
        name = (parts[0]||'').trim();
        type = (parts[1]||'').trim();
        count = (parts[2]||'').trim();
        aliases = (parts[3]||'').trim();
      }
      const typeNum = /^-?\d+$/.test(type) ? Number(type) : null;
      const countNum = /^\d+$/.test(count) ? Number(count) : null;
      const aliasList = aliases ? aliases.split(/[|,]/).map(s=>s.trim()).filter(Boolean) : [];
      if (name) out.push({ name, type: typeNum, count: countNum, aliases: aliasList, lname: name.toLowerCase() });
    }
    return out;
  }

  window.loadTagsSmart = async function(path){
    // Try JSON first (auto-mapped), then CSV
    const jsonPath = toJSONPath(path);
    const jsonCands = candidatesFor(jsonPath);
    const csvCands = candidatesFor(path);

    const js = await tryFetchJSON(jsonCands);
    if (js && Array.isArray(js.json)) {
      window.__easyTag_lastURL = js.url;
      return js.json.map(x => ({
        name: x.name || '',
        lname: (x.name||'').toLowerCase(),
        type: x.type ?? null,
        count: x.count ?? null,
        aliases: Array.isArray(x.aliases) ? x.aliases : []
      }));
    }

    const tx = await tryFetchText(csvCands);
    if (tx) {
      const list = parseCSV(tx.text);
      window.__easyTag_lastURL = tx.url;
      return list;
    }
    console.error('[easy-tag] Failed to load JSON and CSV for', path, jsonCands, csvCands);
    return [];
  };
})();
