/* 034_favorites.js — Favorites (Server → hydrate memory → cache per-user; robust eqId; no optional chaining / no :has) */
(function () {
  'use strict';

  /*========================[ Utils & Polyfills ]========================*/
  if (typeof window.CSS === 'undefined') window.CSS = {};
  if (!window.CSS.escape) window.CSS.escape = function (v) {
    if (v == null) return '';
    return String(v).replace(/[^a-zA-Z0-9_\-]/g, function (c) {
      var h = c.charCodeAt(0).toString(16).toUpperCase();
      return '\\' + h + ' ';
    });
  };

  function qs(sel, root){ try { return (root||document).querySelector(sel); } catch(_){ return null; } }
  function qsa(sel, root){ try { return Array.from((root||document).querySelectorAll(sel)); } catch(_){ return []; } }
  function on(el, ev, fn, opt){ el && el.addEventListener && el.addEventListener(ev, fn, opt||false); }
  function sty(el, o){ if(!el||!el.style) return; for(var k in o) el.style[k]=o[k]; }
  function readGlobal(name){ try{ return eval(name); }catch(_){ try{ return window[name]; }catch(__){ return undefined; } } }
  function _t034(key, fallback, vars){
    try {
      if (typeof window.t === 'function') return window.t(key, fallback, vars);
    } catch(_) {}
    var txt = String(fallback == null ? '' : fallback);
    if (vars && typeof vars === 'object') {
      for (var k in vars) {
        if (!Object.prototype.hasOwnProperty.call(vars, k)) continue;
        txt = txt.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
      }
    }
    return txt;
  }

  /*========================[ User / Settings ]========================*/
  function getUsername(){
    var u = readGlobal('currentUsername');
    if (u==null || String(u).trim()==='') {
      if (typeof window.currentUsername!=='undefined' && window.currentUsername!=null && String(window.currentUsername).trim()!=='') u=window.currentUsername;
      else if (window.localStorage && localStorage.username && String(localStorage.username).trim()!=='') u=localStorage.username;
      else u='guest';
    }
    u = String(u||'guest').trim(); return u || 'guest';
  }
  function userFavKey(){
    return 'userSettings:favorites:' + getUsername();
  }

  function ensureSettings(){
    try { var us = readGlobal('userSettings'); if (us && typeof us==='object') { window.userSettings = us; } } catch(_){}
    window.userSettings = window.userSettings || {};
    if (!Array.isArray(window.userSettings.favorite_templates)) window.userSettings.favorite_templates = [];
    return window.userSettings;
  }

  /*========================[ ID / Equality helpers ]========================*/
  function basename(p){ if(!p) return ''; var q=String(p).split('#')[0]; q=q.split('?')[0]; var i=q.lastIndexOf('/'); return (i>=0?q.slice(i+1):q).toLowerCase(); }
  function stripOrigin(u){ if(!u) return ''; try{ var url=new URL(u, location.href); return (url.pathname+url.search+url.hash)||u; }catch(_){ return String(u); } }
  function eqId(a,b){
    if(!a||!b) return false;
    a = stripOrigin(a).trim(); b = stripOrigin(b).trim();
    return a===b || a.toLowerCase()===b.toLowerCase() || (basename(a)&&basename(a)===basename(b));
  }

  function guessTplId(node){
    if(!node) return '';
    var keys=['id','tplId','templateId','path','file','src','href','key','uid','name','tplName'];
    for (var x=0;x<keys.length;x++){
      var k=keys[x];
      var ds = node.dataset ? (node.dataset[k] || node.dataset[(k.charAt(0).toLowerCase()+k.slice(1))]) : null;
      if (ds && String(ds).trim()!=='') return String(ds);
      var attr='data-'+k.replace(/[A-Z]/g,function(m){return'-'+m.toLowerCase();});
      var v = node.getAttribute ? node.getAttribute(attr) : null;
      if (v && String(v).trim()!=='') return String(v);
    }
    var im = node.querySelector ? node.querySelector('img[src]') : null;
    if (im && im.getAttribute && im.getAttribute('src')) return im.getAttribute('src');
    var hr = node.getAttribute ? node.getAttribute('href') : null;
    if (hr) return hr;
    var txt=(node.dataset&&(node.dataset.name||node.dataset.label))||(node.textContent||'');
    return String(txt).trim();
  }
  function escAttrValue(v){ return String(v==null?'':v).replace(/"/g,'\\"'); }
  function findTplBtnById(id){
    if(!id) return null;
    var val = escAttrValue(id);
    var hit = qs(
      ['[data-id="'+val+'"]','[data-tpl-id="'+val+'"]','[data-template-id="'+val+'"]','[data-path="'+val+'"]','[href="'+val+'"]','[src="'+val+'"]'].join(', ')
    );
    function climb(n){
      while(n && !(n.matches && n.matches('button, a, .template-btn, .tpl-item, .tpl-btn, .tpl-folder-item, [data-id], [data-tpl-id]'))) n=n.parentElement;
      return n;
    }
    if (hit) return climb(hit)||hit;
    var img = qs('img[src="'+val+'"]'); return img ? (climb(img)||img) : null;
  }

  /*========================[ Normalization ]========================*/
  function normalizeSettings(s){
    try{
      if (s && typeof s==='object') {
        if (s.data && typeof s.data==='object') s = s.data;
        else if (s.result && typeof s.result==='object') s = s.result;
        else if (s.settings && typeof s.settings==='object') s = s.settings;
      }
      s = s || {};
      var out = {};
      // copy knowns
      if ('username' in s) out.username = s.username;
      // favorites mapping
      if (Array.isArray(s.favorite_templates)) out.favorite_templates = s.favorite_templates;
      else if (Array.isArray(s.favorites)) out.favorite_templates = s.favorites;
      else if (Array.isArray(s.fav_templates)) out.favorite_templates = s.fav_templates;
      // booleans
      out.auto_cleanup = !!s.auto_cleanup;
      out.enable_tag_autocomplete = !!s.enable_tag_autocomplete;
      out.tag_include_extra_quality = !!s.tag_include_extra_quality;
      // numbers / paths
      out.cleanup_after_minutes = (s.cleanup_after_minutes!=null)? s.cleanup_after_minutes :
                                  (s.cleanup_minutes!=null)? s.cleanup_minutes :
                                  (s.cleanupMin!=null)? s.cleanupMin : 5;
      out.tag_source_main = s.tag_source_main || s.tag_source || s.tags_source || '';
      out.chant_source_main = s.chant_source_main || s.chant_source || s.chants_source || '';
      // ensure array
      if (!Array.isArray(out.favorite_templates)) out.favorite_templates = [];
      return out;
    }catch(_){
      return { username:(window.currentUsername||'guest'), favorite_templates:[], auto_cleanup:false, cleanup_after_minutes:5, enable_tag_autocomplete:false, tag_include_extra_quality:false, tag_source_main:'', chant_source_main:'' };
    }
  }

  /*========================[ Server <-> Memory <-> Local cache ]========================*/
  var API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';
  function getJSON(url){
    return fetch(url, { credentials:'same-origin' }).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
  }

  // Hydrate from server, then write to memory AND to per-user localStorage (as array only)
  function fetchServerSettingsThenHydrate(){
    var u = String(getUsername()||'guest').trim()||'guest';
    if (u==='guest') return Promise.resolve(false);
    var url = API_BASE + '/api/user/settings?username=' + encodeURIComponent(u);
    return getJSON(url).then(function(s){
      var ns = normalizeSettings(s);
      window.userSettings = ns;
      // write cache: array only (same legacy format)
      try { localStorage.setItem(userFavKey(), JSON.stringify(ns.favorite_templates||[])); } catch(_){}
      try { document.dispatchEvent(new CustomEvent('userSettingsLoaded', { detail: ns })); } catch(_){}
      refreshAllHeartsState();
      refreshFavoritesModal();
      return true;
    }).catch(function(){ return false; });
  }

  function saveFavsLocal(){
    try { localStorage.setItem(userFavKey(), JSON.stringify(ensureSettings().favorite_templates || [])); } catch(_){}
  }

  var _saving = false;
  function saveFavsServer(){
    var u = String(getUsername()||'guest').trim()||'guest';
    if (u==='guest' || typeof window.saveUserSettings!=='function') { saveFavsLocal(); return; }
    if (_saving){ clearTimeout(saveFavsServer._t); saveFavsServer._t = setTimeout(saveFavsServer,120); return; }
    _saving = true;
    Promise.resolve().then(function(){ return window.saveUserSettings(); })
      .catch(function(){ /* ignore */ })
      .finally(function(){ _saving=false; });
  }

  /*========================[ Favorites core ]========================*/
  // Load order: memory -> per-user local cache (legacy) -> legacy global key
  function loadFavorites(){
    var us = ensureSettings();
    if (Array.isArray(us.favorite_templates) && us.favorite_templates.length) return us.favorite_templates;

    // fallback to local per-user cache
    try {
      var c = localStorage.getItem(userFavKey());
      if (c) {
        var arr = JSON.parse(c)||[];
        us.favorite_templates = Array.isArray(arr) ? arr : [];
        return us.favorite_templates;
      }
    } catch(_){}

    // legacy global key migration
    try {
      var cold = localStorage.getItem('userSettings:favorites');
      if (cold) {
        var arr2 = JSON.parse(cold)||[];
        us.favorite_templates = Array.isArray(arr2) ? arr2 : [];
        try { localStorage.setItem(userFavKey(), JSON.stringify(us.favorite_templates)); } catch(_){}
        try { localStorage.removeItem('userSettings:favorites'); } catch(_){}
      }
    } catch(_){}
    return us.favorite_templates;
  }

  function isFav(id){
    var favs = loadFavorites();
    for (var i=0;i<favs.length;i++){ if (eqId(favs[i], id)) return true; }
    return false;
  }

  function dedupByEqId(arr){
    var out=[], i, j, keep;
    for(i=0;i<arr.length;i++){
      var v = arr[i];
      if (!v) continue;
      keep = true;
      for(j=0;j<out.length;j++){ if (eqId(v, out[j])) { keep=false; break; } }
      if (keep) out.push(v);
    }
    return out;
  }

  function setFav(id, add){
    id = String(id||'').trim(); if(!id) return;
    var us = ensureSettings(), favs = us.favorite_templates.slice();
    var i=-1; for (var k=0;k<favs.length;k++){ if (eqId(favs[k], id)) { i=k; break; } }
    if (add){ if(i<0) favs.push(id); } else { if(i>=0) favs.splice(i,1); }
    us.favorite_templates = dedupByEqId(favs);
    saveFavsLocal();
    saveFavsServer();
  }

  /*========================[ UI: Candidates + Hearts ]========================*/
  function isSessionControl(node){
    if(!node) return false;
    var container=null;
    try{ container = node.closest && node.closest([
      '#history','#sessions','#historySidebar','#sessionsSidebar',
      '.history','.sessions','.history-list','.sessions-panel',
      '.session-item','.session-controls'
    ].join(', ')); }catch(_){}
    if (container) return true;

    var c1=node.closest&&node.closest('[data-role*="session"]');
    var c2=node.closest&&node.closest('[data-section*="session"]');
    var c3=node.closest&&node.closest('[data-type*="session"]');
    var c4=node.closest&&node.closest('[data-action*="session"]');
    var c5=node.closest&&node.closest('[data-action="delete"], [data-action="restore"], [data-action="reset"]');
    var c6=node.matches&&node.matches('[data-action="delete"], [data-action="restore"], [data-action="reset"]');
    if (c1||c2||c3||c4||c5||c6) return true;

    var ctrl=null; try{ ctrl=node.querySelector&&node.querySelector('.icon-trash,.icon-undo,.icon-restore,.icon-history,.fa-trash,.fa-rotate-left,.fa-history'); }catch(_){}
    if (ctrl) return true;

    var txt=''; try{ txt=((node.getAttribute&&(node.getAttribute('title')||node.getAttribute('aria-label')))||node.textContent||'').trim().toLowerCase(); }catch(_){}
    var blk=['حذف','إزالة','مسح','حذف الجلسة','مسح الجلسة','استعادة','استرجاع','استعادة الجلسة','سجل الجلسات','delete','remove','clear','restore','undo','history','sessions','session'];
    if (txt) for (var i=0;i<blk.length;i++) if (txt.indexOf(blk[i])!==-1) return true;
    return false;
  }

  function templateCandidates(root){
    var ctx=root||document;
    var nodes = qsa('.template-btn, .tpl-item, .tpl-btn, [data-id], [data-tpl-id], [data-template-id], [data-path]', ctx);
    qsa('.tpl-folder-item', ctx).forEach(function(n){ if(nodes.indexOf(n)===-1) nodes.push(n); });
    qsa('.template-btn, .tpl-item, .tpl-btn, button, a, .tpl-folder-item', ctx).forEach(function(n){
      var hasImg=false; try{ hasImg=!!(n.querySelector&&n.querySelector('img')); }catch(_){}
      if (hasImg && nodes.indexOf(n)===-1) nodes.push(n);
    });
    var out=[];
    for (var i=0;i<nodes.length;i++){
      var n=nodes[i], inFav=false;
      try{ inFav = !!(n.closest&&n.closest('.favorites-modal')); }catch(_){}
      if (!inFav && !isSessionControl(n)) out.push(n);
    }
    return out;
  }

  function svgHeart(active, size){
    var c = active ? '#e11d48' : '#ffffff', s = size||18;
    return '<svg viewBox="0 0 24 24" width="'+s+'" height="'+s+'" aria-hidden="true">'+
           '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6.01 4.01 4 6.5 4c1.73 0 3.36.9 4.3 2.34C11.74 4.9 13.37 4 15.1 4 17.59 4 19.6 6.01 19.6 8.5c0 3.78-3.4 6.86-8.55 11.53L12 21.35z" fill="'+c+'" stroke="'+c+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  function applyHeartStyle(el, active){
    el.innerHTML = svgHeart(active, 18);
    el.className = 'fav-heart';
    sty(el, {position:'absolute', top:'8px', right:'10px', padding:'0', lineHeight:'1',
             border:'none', background:'transparent', cursor:'pointer', userSelect:'none', zIndex:'2'});
    try{
      var label = active
        ? _t034('favorites.remove_from_favorites', 'إزالة من المفضلة')
        : _t034('favorites.add_to_favorites', 'إضافة إلى المفضلة');
      el.setAttribute('aria-label', label);
      el.title = label;
    }catch(_){}
  }
  function makeHeart(active){ var b=document.createElement('button'); applyHeartStyle(b, active); return b; }

  function refreshAllHeartsState(){
    qsa('.fav-heart').forEach(function(h){
      var host=h.parentElement;
      while (host && !(host.matches && host.matches('[data-fav-id], .template-btn, .tpl-item, .tpl-btn, [data-id], [data-tpl-id], [data-template-id], [data-path]'))) host=host.parentElement;
      if (!host) return;
      var id = host.getAttribute('data-fav-id') || guessTplId(host);
      if (!id) return;
      applyHeartStyle(h, isFav(id));
    });
  }

  function attachHearts(ctx){
    (function(){
      var nodes = templateCandidates(ctx);
      for (var i=0;i<nodes.length;i++){
        var btn = nodes[i];
        if (btn.__favBound) continue;
        var id = guessTplId(btn); if(!id) continue;
        btn.__favBound = true; try{ btn.setAttribute('data-fav-id', id); }catch(_){}
        try{
          var cs = getComputedStyle(btn), p = cs?cs.position:(btn.style?btn.style.position:'');
          if(!/relative|absolute|fixed/i.test(p||'')) sty(btn, {position:'relative'});
        }catch(_){ if(!/relative|absolute|fixed/i.test((btn.style&&btn.style.position)||'')) sty(btn,{position:'relative'}); }
        if (qs(':scope > .fav-heart', btn)) continue;

        var heart = makeHeart(isFav(id));
        btn.appendChild(heart);
        on(heart, 'click', function(ev){
          ev&&ev.stopPropagation&&ev.stopPropagation();
          var host=this.parentElement;
          while (host && !(host.matches && host.matches('[data-fav-id], .template-btn, .tpl-item, .tpl-btn, [data-id], [data-tpl-id], [data-template-id], [data-path]'))) host=host.parentElement;
          var tplId = host ? (host.getAttribute('data-fav-id') || guessTplId(host)) : '';
          if (!tplId) return;
          if (isFav(tplId)) {
            if (!window.confirm(_t034('favorites.confirm_remove_one', 'هل أنت متأكد من إزالة هذا القالب من المفضلة؟'))) return;
            setFav(tplId, false); applyHeartStyle(this, false);
          } else {
            setFav(tplId, true); applyHeartStyle(this, true);
          }
          refreshFavoritesModal(); refreshAllHeartsState();
        });
      }
    })();
  }

  /*========================[ Favorites Modal ]========================*/
  var favModal=null, favGrid=null, favOpen=false;

  function makeCheckBadge(){
    var b=document.createElement('div');
    sty(b,{position:'absolute', top:'6px', left:'6px', width:'22px', height:'22px', borderRadius:'50%',
           background:'#10a37f', display:'none', alignItems:'center', justifyContent:'center',
           boxShadow:'0 1px 2px rgba(0,0,0,.2)', zIndex:'3'});
    b.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 6L9 17l-5-5" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return b;
  }

  function getTplNameById(id){
    var btn = findTplBtnById(id);
    if(!btn) return '';
    var t = ((btn.getAttribute && (btn.getAttribute('title')||btn.getAttribute('aria-label')))||'').trim();
    if (t) return t;
    var lbl = btn.querySelector ? btn.querySelector('.lbl, .title, .name, [data-role="label"]') : null;
    if (lbl && lbl.textContent) return lbl.textContent.replace(/\s+/g,' ').trim();
    var im  = btn.querySelector ? btn.querySelector('img') : null;
    if (im) { var a=(im.getAttribute && (im.getAttribute('alt')||im.getAttribute('title')))||''; if(a.trim()) return a.trim(); }
    var ds = btn.dataset||{}; t=(ds.label||ds.name||ds.title||ds.tplName||ds.path||'').trim(); if(t) return t;
    return (btn.textContent||'').replace(/\s+/g,' ').trim();
  }

  function buildFavCard(id){
    var card=document.createElement('div');
    card.className='fav-card'; card.setAttribute('data-id',id);
    sty(card,{position:'relative', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:'12px',
              padding:'8px 8px 6px', display:'flex', flexDirection:'column', alignItems:'stretch'});

    var badge=makeCheckBadge(); card.__badge=badge; card.appendChild(badge);

    var imgWrap=document.createElement('div');
    sty(imgWrap,{position:'relative', borderRadius:'10px', overflow:'hidden', background:'#fff', width:'100%', height:'0', paddingTop:'100%'});
    var img=document.createElement('img'); img.alt='template';
    sty(img,{position:'absolute', top:'0', left:'0', right:'0', bottom:'0', width:'100%', height:'100%', objectFit:'cover', display:'block'});

    var orig = findTplBtnById(id), tb = (orig&&orig.querySelector)?orig.querySelector('img'):null;
    if (tb && tb.getAttribute && tb.getAttribute('src')) img.src=tb.getAttribute('src');
    else if (/\.(png|jpe?g|webp|gif|svg)$/i.test(id)) img.src=id;
    else img.src='data:image/svg+xml;utf8,'+encodeURIComponent('<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="12" ry="12" fill="#e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#888" font-size="14">'+_t034('favorites.template_fallback','قالب')+'</text></svg>');
    imgWrap.appendChild(img); card.appendChild(imgWrap);

    var h=makeHeart(true); card.appendChild(h);
    on(h,'click',function(ev){
      ev&&ev.stopPropagation&&ev.stopPropagation();
      if(!window.confirm(_t034('favorites.confirm_remove_one', 'هل أنت متأكد من إزالة هذا القالب من المفضلة؟'))) return;
      setFav(id,false);
      var tbBtn=findTplBtnById(id); if(tbBtn){ var hb=qs('.fav-heart',tbBtn); if(hb) applyHeartStyle(hb,false); }
      refreshFavoritesModal(); refreshAllHeartsState();
    });

    var name=getTplNameById(id)||_t034('favorites.template_fallback', 'قالب'), cap=document.createElement('div'); cap.textContent=name; cap.title=name;
    sty(cap,{fontSize:'12px', lineHeight:'1.2', fontWeight:'600', color:'#111', textAlign:'center',
             padding:'6px 2px 0', whiteSpace:'nowrap', textOverflow:'ellipsis', overflow:'hidden', direction:'rtl'});
    card.appendChild(cap);

    on(card,'click',function(){
      var o=findTplBtnById(id); if(!o) return;
      try{ ['pointerdown','mousedown','mouseup','click'].forEach(function(t){ o.dispatchEvent(new MouseEvent(t,{bubbles:true, cancelable:true, view:window})); }); }
      catch(_){ try{o.click();}catch(__){} }
    });

    return card;
  }

  function refreshFavoritesModal(){
    if(!favGrid) return;
    favGrid.innerHTML='';
    var favs=loadFavorites();
    if(!favs.length){
      var empty=document.createElement('div');
      empty.textContent=_t034('favorites.none_added', 'لا توجد قوالب مضافة إلى المفضلة بعد.');
      sty(empty,{opacity:'0.8', padding:'16px 0'});
      favGrid.appendChild(empty); return;
    }
    for (var i=0;i<favs.length;i++){ favGrid.appendChild(buildFavCard(favs[i])); }
    setTimeout(syncFavBadges, 0);
  }

  function openFavoritesModal(){
    if(!favModal){
      favModal=document.createElement('div'); favModal.className='favorites-modal';
      sty(favModal,{position:'fixed', left:'0', top:'0', right:'0', bottom:'0', background:'rgba(0,0,0,.35)',
                    display:'flex', alignItems:'center', justifyContent:'center', zIndex:'1000'});
      var wrap=document.createElement('div');
      sty(wrap,{width:'min(960px, 96vw)', maxWidth:'96vw', maxHeight:'86vh', overflow:'auto',
                background:'var(--card, #fff)', borderRadius:'16px', boxShadow:'0 10px 30px rgba(0,0,0,.2)', padding:'16px'});
      var title=document.createElement('div'); title.textContent=_t034('favorites.title', 'القوالب المفضلة');
      sty(title,{fontSize:'16px', fontWeight:'600', marginBottom:'8px', textAlign:'right'});
      favGrid=document.createElement('div');
      sty(favGrid,{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:'12px', alignItems:'start'});
      var close=document.createElement('button'); close.textContent=_t034('common.close', 'إغلاق'); close.className='btn'; sty(close,{marginTop:'12px'});

      wrap.appendChild(title); wrap.appendChild(favGrid); wrap.appendChild(close);
      favModal.appendChild(wrap); document.body.appendChild(favModal);
      on(favModal,'click',function(e){ if(e&&e.target===favModal) close.click(); });
      on(close,'click',function(){ if(favModal&&favModal.parentNode) favModal.parentNode.removeChild(favModal); favModal=null; favGrid=null; favOpen=false; });
    }
    refreshFavoritesModal(); favOpen=true; refreshAllHeartsState();
  }

  /*========================[ ✓ Selection sync ]========================*/
  function readSelectedKeys(){
    var keys=[], st, si, arr;
    try{ st=eval('selectedTemplate'); }catch(_){ st=window.selectedTemplate; }
    try{ si=eval('selectedIndex'); }catch(_){ si=window.selectedIndex; }
    try{ arr=eval('templates'); }catch(_){ arr=window.templates; } arr=arr||[];
    if(st){ if(st.img)keys.push(st.img); if(st.path)keys.push(st.path); if(st.name)keys.push(st.name); if(st.label)keys.push(st.label); }
    if (si!=null && arr && arr[si]){ var t=arr[si]; if(t.img)keys.push(t.img); if(t.path)keys.push(t.path); if(t.name)keys.push(t.name); if(t.label)keys.push(t.label); }
    var seen={}, out=[]; for(var i=0;i<keys.length;i++){ var k=String(keys[i]); if(!seen[k]){seen[k]=1; out.push(keys[i]);} } return out;
  }
  function syncFavBadges(){
    if(!favGrid) return;
    var keys=readSelectedKeys();
    qsa('.fav-card', favGrid).forEach(function(card){
      var id=card.getAttribute('data-id'), match=false;
      for(var j=0;j<keys.length;j++){ if(eqId(id, keys[j])){ match=true; break; } }
      if (card.__badge && card.__badge.style) card.__badge.style.display = match ? 'flex' : 'none';
    });
  }

  /*========================[ Observers / Init / Hooks ]========================*/
  var moHearts=new MutationObserver(function(){ attachHearts(); });
  try{ moHearts.observe(document.body,{childList:true,subtree:true}); }catch(_){}

  var moSel=new MutationObserver(function(){ if(favOpen) syncFavBadges(); });
  try{ moSel.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','aria-selected','aria-pressed','data-selected']}); }catch(_){}

  document.addEventListener('click', function(e){
    var n=e.target;
    while(n && !(n.matches && n.matches('.template-btn, .tpl-item, .tpl-btn, .tpl-folder-item, [data-id], [data-tpl-id], [data-template-id], [data-path]'))) n=n.parentElement;
    if(!n) return;
    if(favOpen){ syncFavBadges(); setTimeout(syncFavBadges, 60); }
  }, true);

  // Wrap loadUserSettings to hydrate after server completes
  function wrapLoadUserSettingsOnce(){
    var orig=window.loadUserSettings;
    if(typeof orig!=='function' || orig.__favWrapped) return;
    function wrapped(){
      var p=orig.apply(this, arguments);
      try{
        if(p && typeof p.then==='function'){
          p.then(function(){
            // server settings ready
            fetchServerSettingsThenHydrate();
            setTimeout(function(){ attachHearts(); refreshAllHeartsState(); },0);
          });
        } else {
          fetchServerSettingsThenHydrate();
          setTimeout(function(){ attachHearts(); refreshAllHeartsState(); },0);
        }
      }catch(_){}
      return p;
    }
    wrapped.__favWrapped=true; window.loadUserSettings=wrapped;
  }
  wrapLoadUserSettingsOnce(); setTimeout(wrapLoadUserSettingsOnce, 200);

  // Listen to unified event (in case 025_user_sessions.js dispatches it)
  document.addEventListener('userSettingsLoaded', function(){ setTimeout(function(){ refreshAllHeartsState(); refreshFavoritesModal(); }, 0); });

  // Init
  var _lastUser = getUsername();
  function init(){
    var favBtn = document.querySelector('.favorites-menu-btn') || document.getElementById('favoritesBtn');
    if (favBtn) on(favBtn, 'click', openFavoritesModal);

    // hydrate from memory/local quickly
    ensureSettings().favorite_templates = loadFavorites().slice();
    attachHearts();
    setTimeout(function(){
      refreshAllHeartsState();
      // then fetch from server and cache locally (source of truth)
      fetchServerSettingsThenHydrate();
    }, 200);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();

  // Watch username change
  setInterval(function(){
    var u = getUsername();
    if (u !== _lastUser) {
      _lastUser = u;
      ensureSettings().favorite_templates = loadFavorites().slice();
      refreshAllHeartsState();
      refreshFavoritesModal();
      fetchServerSettingsThenHydrate();
    }
  }, 1000);

  // Public API
  window.Favorites = {
    load: loadFavorites,
    isFav: isFav,
    toggle: function(id){ setFav(id, !isFav(id)); refreshAllHeartsState(); refreshFavoritesModal(); },
    refreshHearts: refreshAllHeartsState,
    openModal: openFavoritesModal,
    refreshModal: refreshFavoritesModal
  };
})();