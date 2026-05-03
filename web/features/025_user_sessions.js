/* 025_user_sessions.js — RACE-PROOF LOGIN & RESTORE (clean rebuild)
   Goals:
   - Keep your original sessions list UX (date/preview/buttons)
   - Restore last session on login + on refresh
   - Select dropdown values WITHOUT creating duplicates
   - No risky regex edits; contained helpers only
*/
(function(){
  'use strict'

  function _t(key, fallback, params){
    try { if (window.t) return window.t(key, fallback, params); } catch(e) {}
    return fallback;
  }

// ---- Ensure server settings dominate UI & local cache after refresh ----
function __applySettingsToUI__(s){
  try{
    if(!s) return;
    try { window.userSettings = s; } catch(_){}
    try { localStorage.setItem('easyTagSettings:guest', JSON.stringify(s)); } catch(_){}
    try {
      var $ = function(id){ return document.getElementById(id); };
      if ($('usernameInput') && s.username) $('usernameInput').value = s.username;
      if ($('autoCleanupCheck')) $('autoCleanupCheck').checked = !!s.auto_cleanup;
      if ($('cleanupTimeSelect')) $('cleanupTimeSelect').value = String(s.cleanup_after_minutes||5);
      if ($('cleanupTimeLabel')) $('cleanupTimeLabel').style.display = (s.auto_cleanup ? '' : 'none');
      if ($('autoTranslateArabic')) $('autoTranslateArabic').checked = !!s.auto_translate_arabic;
      function findOptionByAny(sel, v){
        if(!sel) return null;
        var val = String(v||''); var base = val.split('/').pop();
        for(var i=0;i<sel.options.length;i++){
          var opt=sel.options[i];
          if (opt.value===val || opt.value===base) return opt;
        }
        return null;
      }
      var tagSel = $('tagSourceSelect');
      if (tagSel && s.tag_source_main){
        var fo = findOptionByAny(tagSel, s.tag_source_main);
        if (fo) tagSel.value = fo.value;
      }
      var chantSel = $('chantSourceSelect');
      if (chantSel && s.chant_source_main){
        var fo2 = findOptionByAny(chantSel, s.chant_source_main);
        if (fo2) chantSel.value = fo2.value;
      }
      if ($('lmTranslateArabic')) $('lmTranslateArabic').checked = !!s.lm_translate_arabic;
    } catch(_){}
    try { __pokeAutocompleteAfterSettings__ && __pokeAutocompleteAfterSettings__(); } catch(_){}
  }catch(_){}
}
function __applySettingsToUI_scheduled__(s){
  try{
    var delays=[0,50,150,400,1000];
    delays.forEach(function(ms){ setTimeout(function(){ __applySettingsToUI__(s); }, ms); });
  }catch(_){}
}

;

  var API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';
  function $(id){ return document.getElementById(id); }

  // ---------------- Global state & guards ----------------
  window.__LOGIN_FLOW_ACTIVE__   = false;
  window.__RESTORE_FLOW_ACTIVE__ = false;
  window.__settingsCtrl = null;
  window.__sessionsCtrl = null;
  window.sessions = window.sessions || [];

  function setUsername(u){
    u = String(u||'').trim();
    if (!u) return;
    window.currentUsername = u;
    try { localStorage.setItem('easyui:last_username', u); localStorage.username = u; } catch(e){}
    var el = $('usernameInput'); if (el) el.value = u;
  }
  function getUsername(){ return (window.currentUsername||'').trim(); }
  function readInputName(){ var el = $('usernameInput'); return el && el.value ? String(el.value).trim() : ''; }
  function cancelInFlight(){
    try{ if (window.__settingsCtrl){ window.__settingsCtrl.abort(); } }catch(e){}
    try{ if (window.__sessionsCtrl){ window.__sessionsCtrl.abort(); } }catch(e){}
    window.__settingsCtrl = null; window.__sessionsCtrl = null;
  }

  function getJSON(url, kind){
    var ctrl = new AbortController();
    if (kind === 'settings'){ window.__settingsCtrl = ctrl; }
    else if (kind === 'sessions'){ window.__sessionsCtrl = ctrl; }
    return fetch(url, { cache: 'no-store', signal: ctrl.signal }).then(function(r){
      if (!r.ok) throw new Error('HTTP '+r.status+' @ '+url);
      return r.json();
    });
  }
  function postJSON(url, body){
    return fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status+' @ '+url); return r.json(); });
  }

  // ---------------- Select helpers (safe, no-dup) ----------------
  function norm(v){
    v = (v==null?'':String(v)).trim();
    v = v.replace(/[?#].*$/, '');           // drop query/hash
    v = v.replace(/^\/+/, '');              // leading slashes
    v = v.replace(/^(?:\.\/?)+/, '');       // ./ or ../
    v = v.replace(/\/+/g, '/');              // collapse slashes
    var lv = v.toLowerCase();
    var t = lv.indexOf('easy-tag/tags/');   if (t>=0) v = 'easy-tag/tags/'   + v.slice(t + 'easy-tag/tags/'.length);
    var c = lv.indexOf('easy-tag/chants/'); if (c>=0) v = 'easy-tag/chants/' + v.slice(c + 'easy-tag/chants/'.length);
    // compare by basename only
    var parts = v.split('/');
    v = parts[parts.length-1] || v;
    return String(v).toLowerCase();
  }
function findOptionByAny(sel, val){
    if (!sel || val==null) return null;
    var n = norm(val);
    for (var i=0;i<sel.options.length;i++){
      var o = sel.options[i];
      if (norm(o.value) === n) return o;                 // normalized match
      if (String(o.value).trim() === String(val).trim()) // exact match
        return o;
    }
    return null;
  }
  // Select ONLY if an equivalent option already exists (do NOT create new options)
  function setSelectFromAny(selId, val){
    var sel = $(selId); if (!sel) return;
    if (val==null || val==='') return;
    var exist = findOptionByAny(sel, val);
    if (exist){ sel.value = exist.value; }
    // else: leave current selection as-is; DO NOT add anything
  }
  function dedupeSelect(selId){
    var sel = $(selId); if (!sel) return;
    var seen = Object.create(null);
    for (var i=0;i<sel.options.length;i++){
      var o = sel.options[i]; var key = norm(o.value);
      if (!seen[key]){ seen[key] = i; } else { sel.remove(i); i--; }
    }
  }

  
  // Ensure an option exists (used when server returns a value not pre-populated)
  function ensureOption(selId, val, label){
    var sel = $(selId); if (!sel) return;
    var v = (val==null?'':String(val)).trim(); if (!v) return;
    var found = findOptionByAny(sel, v);
    if (!found){
      try{
        var opt = document.createElement('option');
        opt.value = v;
        opt.textContent = label || v;
        sel.appendChild(opt);
      }catch(e){}
    }
    // select it
    try{ sel.value = findOptionByAny(sel, v) ? findOptionByAny(sel, v).value : v; }catch(e){}
  }
// ---------------- EasyTag dispatch ----------------
  function dispatchEasyTag(s){
    try {
      document.dispatchEvent(new CustomEvent('easyTagSettingsChanged', { detail: {
        enable_tag_autocomplete: !!s.enable_tag_autocomplete,
        tag_include_extra_quality: !!s.tag_include_extra_quality,
        tag_source_main: s.tag_source_main || '',
        chant_source_main: s.chant_source_main || ''
      }}));
    } catch(e){}
  }

  // ---------------- SETTINGS ----------------
  window.loadUserSettings = function(){
    // one-time hook for autoCleanupCheck -> toggles label visibility
    (function(){
      var el = $('autoCleanupCheck');
      if (el && !el.__boundToggle){
        el.__boundToggle = true;
        el.addEventListener('change', function(){
          if ($('cleanupTimeLabel')) $('cleanupTimeLabel').style.display = (el.checked ? '' : 'none');
        });
      }
      var at = $('autoTranslateArabic');
      if (at && !at.__boundToggle){
        at.__boundToggle = true;
        at.addEventListener('change', function(){
          var enabled = !!at.checked;
          try { localStorage.setItem('AUTO_TRANSLATE_ARABIC', enabled ? '1' : '0'); } catch(e){}
          try {
            window.userSettings = window.userSettings || {};
            window.userSettings.auto_translate_arabic = enabled;
          } catch(_){ }
        });
      }
    })();

    var u = getUsername() || 'guest';
    if (u === 'guest'){
      var guestUrl = API_BASE + '/api/user/settings?username=guest';
      return getJSON(guestUrl, 'settings').then(function(serverGuest){
        var _langFromStorage = null;
        try { _langFromStorage = localStorage.getItem('ui_lang'); } catch(e){}
        var _storedAutoTranslate = null;
        try { _storedAutoTranslate = localStorage.getItem('AUTO_TRANSLATE_ARABIC'); } catch(e){}

        var _defaultUiLang = (serverGuest && serverGuest.ui_language) || _langFromStorage || 'en';
        var _autoTranslateArabic = (_storedAutoTranslate === null)
          ? !!(serverGuest && serverGuest.auto_translate_arabic)
          : (_storedAutoTranslate === '1');

        var d = {
          username:'guest',
          ui_language:_defaultUiLang,
          favorite_templates:[],
          auto_cleanup:false,
          cleanup_after_minutes:5,
          enable_tag_autocomplete:false,
          tag_include_extra_quality:false,
          tag_source_main:'',
          chant_source_main:'',
          auto_translate_arabic:_autoTranslateArabic,
          lm_translate_arabic:false
        };
        window.userSettings = d;

        try { localStorage.setItem('ui_lang', _defaultUiLang); } catch(e){}
        try {
          if (typeof window.setLanguage === 'function') {
            window.setLanguage(_defaultUiLang, { save: true });
          }
        } catch(e){}
        try { localStorage.setItem('LM_TRANSLATE_ARABIC', '0'); } catch(e){}
        try { localStorage.setItem('AUTO_TRANSLATE_ARABIC', _autoTranslateArabic ? '1' : '0'); } catch(e){}
        window.lmTranslateArabic = false;
        if ($('lmTranslateArabic')) $('lmTranslateArabic').checked = false;
        if ($('autoTranslateArabic')) $('autoTranslateArabic').checked = _autoTranslateArabic;
        if ($('autoCleanupCheck')) $('autoCleanupCheck').checked = false;
        if ($('cleanupTimeSelect')) $('cleanupTimeSelect').value = '5';
        if ($('cbTagAutocomplete')) $('cbTagAutocomplete').checked = false;
        if ($('cbTagMergeQuality')) $('cbTagMergeQuality').checked = false;
setSelectFromAny('tagSourceSelect', d.tag_source_main);
setSelectFromAny('chantSourceSelect', d.chant_source_main);
if ($('cleanupTimeLabel')) $('cleanupTimeLabel').style.display = ($('autoCleanupCheck') && $('autoCleanupCheck').checked) ? '' : 'none';
        dedupeSelect('tagSourceSelect');
        dedupeSelect('chantSourceSelect');
        dispatchEasyTag(d);

        __applySettingsToUI_scheduled__(d);return d;
      }).catch(function(){
        var _langFromStorage = null;
        try { _langFromStorage = localStorage.getItem('ui_lang'); } catch(e){}
        var _defaultUiLang = _langFromStorage || 'en';
        var _storedAutoTranslate = null;
        try { _storedAutoTranslate = localStorage.getItem('AUTO_TRANSLATE_ARABIC'); } catch(e){}
        var _autoTranslateArabic = (_storedAutoTranslate === null) ? true : (_storedAutoTranslate === '1');
        var d = {
          username:'guest',
          ui_language:_defaultUiLang,
          favorite_templates:[],
          auto_cleanup:false,
          cleanup_after_minutes:5,
          enable_tag_autocomplete:false,
          tag_include_extra_quality:false,
          tag_source_main:'',
          chant_source_main:'',
          auto_translate_arabic:_autoTranslateArabic,
          lm_translate_arabic:false
        };
        window.userSettings = d;
        try { localStorage.setItem('ui_lang', _defaultUiLang); } catch(e){}
        try {
          if (typeof window.setLanguage === 'function') {
            window.setLanguage(_defaultUiLang, { save: true });
          }
        } catch(e){}
        try { localStorage.setItem('LM_TRANSLATE_ARABIC', '0'); } catch(e){}
        try { localStorage.setItem('AUTO_TRANSLATE_ARABIC', _autoTranslateArabic ? '1' : '0'); } catch(e){}
        window.lmTranslateArabic = false;
        if ($('lmTranslateArabic')) $('lmTranslateArabic').checked = false;
        if ($('autoTranslateArabic')) $('autoTranslateArabic').checked = _autoTranslateArabic;
        if ($('autoCleanupCheck')) $('autoCleanupCheck').checked = false;
        if ($('cleanupTimeSelect')) $('cleanupTimeSelect').value = '5';
        if ($('cbTagAutocomplete')) $('cbTagAutocomplete').checked = false;
        if ($('cbTagMergeQuality')) $('cbTagMergeQuality').checked = false;
setSelectFromAny('tagSourceSelect', d.tag_source_main);
setSelectFromAny('chantSourceSelect', d.chant_source_main);
if ($('cleanupTimeLabel')) $('cleanupTimeLabel').style.display = ($('autoCleanupCheck') && $('autoCleanupCheck').checked) ? '' : 'none';
        dedupeSelect('tagSourceSelect');
        dedupeSelect('chantSourceSelect');
        dispatchEasyTag(d);

        __applySettingsToUI_scheduled__(d);return d;
      });
    }

    var unameAtCall = u;
    var url = API_BASE + '/api/user/settings?username=' + encodeURIComponent(unameAtCall);
    return getJSON(url, 'settings').then(function(s){
      if (unameAtCall !== getUsername()) return; // stale response
      s = s || {}; window.userSettings = s;

      if (s.ui_language) {
        try { localStorage.setItem('ui_lang', s.ui_language); } catch(e){}
        try {
          if (typeof window.setLanguage === 'function') {
            window.setLanguage(s.ui_language, { save: true });
          }
        } catch(e){}
      }
      
      // استرجاع إعدادات LM
      if (s.lm_button_hidden !== undefined) localStorage.setItem('LM_BUTTON_HIDDEN', s.lm_button_hidden ? '1' : '0');
      if (s.ollama_model) localStorage.setItem('OLLAMA_MODEL', s.ollama_model);
      if (s.lm_translate_arabic !== undefined) {
        localStorage.setItem('LM_TRANSLATE_ARABIC', s.lm_translate_arabic ? '1' : '0');
        window.lmTranslateArabic = !!s.lm_translate_arabic;
      }
      var autoTranslateArabicEnabled = (s.auto_translate_arabic !== undefined) ? !!s.auto_translate_arabic : true;
      localStorage.setItem('AUTO_TRANSLATE_ARABIC', autoTranslateArabicEnabled ? '1' : '0');
      if ($('autoTranslateArabic')) $('autoTranslateArabic').checked = autoTranslateArabicEnabled;

      if ($('usernameInput')) $('usernameInput').value = getUsername();
      if ($('autoCleanupCheck')) $('autoCleanupCheck').checked = !!s.auto_cleanup;
      if ($('cleanupTimeSelect')) $('cleanupTimeSelect').value = String((s.cleanup_after_minutes!=null?s.cleanup_after_minutes:5));
      if ($('cbTagAutocomplete')) $('cbTagAutocomplete').checked = !!s.enable_tag_autocomplete;
      if ($('cbTagMergeQuality')) $('cbTagMergeQuality').checked = !!s.tag_include_extra_quality;

setSelectFromAny('tagSourceSelect',   s.tag_source_main || '');
setSelectFromAny('chantSourceSelect', s.chant_source_main || '');
dedupeSelect('tagSourceSelect');
dedupeSelect('chantSourceSelect');
if ($('cleanupTimeLabel')) $('cleanupTimeLabel').style.display = ($('autoCleanupCheck') && $('autoCleanupCheck').checked) ? '' : 'none';
dispatchEasyTag(s);
      
      __applySettingsToUI_scheduled__(s);return s;
    }).catch(function(e){ console.warn('loadUserSettings failed', e); });
  };

  window.saveUserSettings = function(){
    var u = readInputName() || getUsername() || 'guest';
    if (u === 'guest'){ alert(_t('sessions.err_save_guest_settings', 'لا يمكن حفظ إعدادات المستخدم "guest"')); return Promise.resolve(false); }
    function fixPath(val, kind){
      if (!val) return '';
      if (/^https?:\/\//i.test(val)) return val; // allow absolute
      if (val[0] === '/') return val.replace(/^\/+/, '');
      if (val.indexOf('easy-tag/') === 0) return val;
      return (kind==='tags' ? 'easy-tag/tags/' : 'easy-tag/chants/') + val;
    }
    var payload = {
      username: u,
      ui_language: (typeof window.getLanguage === 'function' ? window.getLanguage() : (localStorage.getItem('ui_lang') || 'ar')),
      favorite_templates: (window.userSettings && window.userSettings.favorite_templates) || [],
      auto_cleanup: !!($('autoCleanupCheck') && $('autoCleanupCheck').checked),
      cleanup_after_minutes: parseInt(($('cleanupTimeSelect') && $('cleanupTimeSelect').value) || '5', 10) || 5,
      enable_tag_autocomplete: !!($('cbTagAutocomplete') && $('cbTagAutocomplete').checked),
      tag_include_extra_quality: !!($('cbTagMergeQuality') && $('cbTagMergeQuality').checked),
      tag_source_main: fixPath(($('tagSourceSelect') && $('tagSourceSelect').value) || '', 'tags'),
      chant_source_main: fixPath(($('chantSourceSelect') && $('chantSourceSelect').value) || '', 'chants'),
      dark_mode: !!($('darkModeToggle') && $('darkModeToggle').checked),
      lm_button_hidden: (localStorage.getItem('LM_BUTTON_HIDDEN') === '1'),
      lm_translate_arabic: (localStorage.getItem('LM_TRANSLATE_ARABIC') === '1'),
      auto_translate_arabic: !!($('autoTranslateArabic') && $('autoTranslateArabic').checked),
      ollama_model: localStorage.getItem('OLLAMA_MODEL') || 'tinyllama:latest'
    };
    return postJSON(API_BASE + '/api/user/settings', payload).then(function(res){
      if (!res || !res.success){ alert(_t('sessions.err_save_settings', 'فشل حفظ الإعدادات')); return false; }
      setUsername(u);
      window.userSettings = payload;
      dispatchEasyTag(payload);
      
      __applySettingsToUI_scheduled__(payload);return restoreLastSessionIfAny({ preferServerList: false });
    }).catch(function(e){ alert(_t('errors.connection', 'خطأ في الاتصال بالخادم')); console.warn(e); return false; });
  };

  // ---------------- Sessions list (your original UX) ----------------
  function escapeHtml(s){ s = (s==null?'':String(s)); return s.replace(/[&<>\"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[c]); }); }
  function formatDate(iso){ try { var d = new Date(iso || Date.now()); return d.toLocaleString(); } catch(e){ return String(iso||''); } }

  window.renderSessionList = function(list){
    list = Array.isArray(list)? list : [];
    window.sessions = list;
    var host = $('sessionList'); if (!host) return;
    if (!list.length){ host.innerHTML = '<div style="padding:12px;text-align:center;color:#666">'+ escapeHtml(_t('sessions.none_saved', 'لا توجد جلسات مسجلة')) +'</div>'; return; }
    host.innerHTML = '';
    list.forEach(function(session){
      var item = document.createElement('div');
      item.className = 'session-item';
      var sid = session.session_id || session.id || '';
      if (sid && sid === window.currentSessionId){ item.classList.add('active'); }
      var preview = escapeHtml(session.preview || '');
      var openTxt = escapeHtml(_t('sessions.open', 'فتح'));
      var delTxt = escapeHtml(_t('sessions.delete', 'حذف'));
      item.innerHTML = (
        '<div class="date">'+ formatDate(session.created_at) +'</div>'+
        '<div class="preview" title="'+ preview +'">'+ preview +'</div>'+
        '<div class="session-actions">'+
          '<button class="session-load" data-id="'+ escapeHtml(sid) +'">'+ openTxt +'</button>'+
          '<button class="session-delete" data-id="'+ escapeHtml(sid) +'">'+ delTxt +'</button>'+
        '</div>'
      );
      $('sessionList').appendChild(item);
    });
  };

  window.loadUserSessions = function(){
    var u = getUsername() || 'guest';
    if (u === 'guest') {
      window.sessions = [];
      var host=$('sessionList');
      if(host){ host.innerHTML = '<div style="padding:12px;text-align:center;color:#666">'+ escapeHtml(_t('sessions.none_guest', 'لا توجد جلسات للضيف')) +'</div>'; }
      return Promise.resolve([]);
    }
    var unameAtCall = u;
    var url = API_BASE + '/api/user/sessions?username=' + encodeURIComponent(unameAtCall);
    return getJSON(url, 'sessions').then(function(data){
      if (unameAtCall !== getUsername()) return; // ignore stale
      window.sessions = Array.isArray(data) ? data : [];
      window.renderSessionList(window.sessions);
      return window.sessions;
    }).catch(function(e){
      console.warn('loadUserSessions failed', e);
      var host=$('sessionList');
      if(host){ host.innerHTML = '<div style="padding:12px;text-align:center;color:#666">'+ escapeHtml(_t('sessions.err_load', 'تعذر تحميل الجلسات')) +'</div>'; }
    });
  };

  window.deleteSession = function(sessionId){
    var u = getUsername() || 'guest';
    if (u === 'guest'){ alert(_t('sessions.err_delete_guest', 'لا يمكن حذف جلسات الضيف')); return; }
    if (!sessionId){ return; }
    if (!confirm(_t('sessions.confirm_delete_one', 'هل أنت متأكد من حذف هذه الجلسة؟'))) return;
    fetch(API_BASE + '/api/user/session/' + encodeURIComponent(sessionId) + '?username=' + encodeURIComponent(u), { method:'DELETE' })
      .then(function(r){ return r.json(); })
      .then(function(res){
        if (!res || !res.success){ alert(_t('sessions.err_delete_one', 'فشل حذف الجلسة')); return; }
        if (sessionId === window.currentSessionId){
          try { window.currentSessionId = (crypto && crypto.randomUUID)? crypto.randomUUID(): 's_'+Date.now(); } catch(e){ window.currentSessionId = 's_'+Date.now(); }
          try { localStorage.session_id = window.currentSessionId; } catch(e){}
          var host = $('chat'); if (host) host.innerHTML = '';
          if (Array.isArray(window.chatMedia)) window.chatMedia = [];
        }
        }).catch(function(){ alert(_t('errors.connection', 'خطأ في الاتصال بالخادم')); })
      .finally(function(){ window.loadUserSessions().then(function(){ restoreLastSessionIfAny({ preferServerList: true }); try { location.reload(); } catch(e){} }); });
  };

  window.clearAllSessions = function(){
    var u = getUsername() || 'guest';
    if (u === 'guest'){ alert(_t('sessions.err_delete_guest', 'لا يمكن حذف جلسات الضيف')); return; }
    if (!confirm(_t('sessions.confirm_delete_all', 'هل أنت متأكد من حذف جميع الجلسات؟'))) return;
    var list = Array.isArray(window.sessions)? window.sessions : [];
    var reqs = list.map(function(s){
      var sid = s.session_id || s.id; if(!sid) return Promise.resolve();
      return fetch(API_BASE + '/api/user/session/' + encodeURIComponent(sid) + '?username=' + encodeURIComponent(u), { method:'DELETE' }).catch(function(){});
    });
    Promise.all(reqs).then(function(){
      try { window.currentSessionId = (crypto && crypto.randomUUID)? crypto.randomUUID(): 's_'+Date.now(); } catch(e){ window.currentSessionId = 's_'+Date.now(); }
      try { localStorage.session_id = window.currentSessionId; } catch(e){}
      var host = $('chat'); if (host) host.innerHTML = '';
      if (Array.isArray(window.chatMedia)) window.chatMedia = [];
    }).finally(function(){ window.loadUserSessions().then(function(){ restoreLastSessionIfAny({ preferServerList: true }); try { location.reload(); } catch(e){} }); });
  };

  window.cleanupFiles = function(){
    var u = getUsername() || 'guest';
    if (u === 'guest'){ alert(_t('sessions.err_cleanup_guest', 'لا يمكن تنظيف ملفات الضيف')); return; }
    var mins = (window.userSettings && window.userSettings.cleanup_after_minutes) || 5;
    fetch(API_BASE + '/api/user/cleanup?username=' + encodeURIComponent(u) + '&older_than_minutes=' + encodeURIComponent(mins), { method:'POST' })
      .then(function(r){ return r.json(); })
        .then(function(res){ alert(res && res.success? _t('sessions.cleanup_ok', 'تم تنظيف الملفات بنجاح') : _t('sessions.cleanup_failed', 'فشل تنظيف الملفات')); })
        .catch(function(){ alert(_t('errors.connection', 'خطأ في الاتصال بالخادم')); });
  };

  // ---- New Session ----
  window.newSession = function(){
    var u = getUsername() || 'guest';
    if (u === 'guest'){ alert(_t('sessions.err_new_guest', 'لا يمكن إنشاء جلسة للضيف')); return; }
    // generate a fresh session id
    var sid;
    try { sid = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('s_'+Date.now()); } catch(e){ sid = 's_'+Date.now(); }
    try { window.currentSessionId = sid; } catch(e){}
    try { localStorage.session_id = sid; } catch(e){}
    // clear chat UI
    try { var host = document.getElementById('chat'); if (host) host.innerHTML = ''; } catch(e){}
    try { if (Array.isArray(window.chatMedia)) window.chatMedia = []; } catch(e){}
    try { if (Array.isArray(window.sendHistory)) window.sendHistory.length = 0; } catch(e){}
    // notify listeners (optional)
    try { document.dispatchEvent(new CustomEvent('sessionStarted', { detail:{ session_id: sid, username: u } })); } catch(e){}
    // refresh the page
    try { location.reload(); } catch(e){}
    // refresh the server list (if any) and mark active
    try { window.loadUserSessions && window.loadUserSessions().then(function(){ /* no-op */ }); } catch(e){}
  };

// ---------------- Restore logic ----------------
  function pickSessionIdToRestore(opts){
    opts = opts || {};
    var sid = null;
    try { sid = localStorage.session_id || localStorage.getItem('session_id') || null; } catch(e){}
    if (!sid && opts.preferServerList && Array.isArray(window.sessions) && window.sessions.length){
      var top = window.sessions[0];
      sid = top.session_id || top.id || null;
      if (sid){ try { localStorage.session_id = sid; } catch(e){} }
    }
    return sid;
  }
  function fetchSession(sessionId, username){
    var u = username || getUsername();
    if (!sessionId || !u || u === 'guest') return Promise.reject(new Error('no session or guest'));
    var url = API_BASE + '/api/user/session/' + encodeURIComponent(sessionId) + '?username=' + encodeURIComponent(u);
    return getJSON(url, '');
  }
  function applySessionPayload(payload, sessionId){
    try { window.currentSessionId = sessionId; } catch(e){}
    try { localStorage.session_id = sessionId; } catch(e){}
    // delegate to app loader if present
    if (typeof window.loadSession === 'function'){
      try { return window.loadSession(sessionId); }
      catch(e){ console.warn('delegated loadSession failed, using fallback', e); }
    }
    // fallback render (text + basic images)
    var chat = $('chat'); if (chat) chat.innerHTML = '';
    if (Array.isArray(window.chatMedia)) window.chatMedia = [];
    var addBubble = window.addBubble || function(text, who){
      if (!chat) return; var div=document.createElement('div'); div.className='bubble '+(who||''); div.textContent=text||''; chat.appendChild(div);
    };
    // allow passing msg/negP if available
    var renderAssistant = window.renderAssistant || function(text, msg, negP){ addBubble(text||'', 'assistant'); };

    function _extractEffectivePayloadFromMsg(msg){
      try{
        if (!msg || typeof msg !== 'object') return null;
        var m = msg;
        var cands = [
          m.used_payload, m.payload, m.request, m.input_payload, m.echo,
          m.meta && (m.meta.used_payload || m.meta.payload || m.meta.request),
          m.result && m.result.used_payload
        ];
        for (var i=0;i<cands.length;i++){ var c=cands[i]; if (c && typeof c==='object') return c; }
      }catch(_){}
      return null;
    }
    function _attachRegenPayloadForLastAssistant(msg){
      try{
        var p = _extractEffectivePayloadFromMsg(msg);
        if (!p) return;
        if (!chat) return;
        var target = null;
        var wraps = chat.querySelectorAll('.msg.assistant');
        if (wraps && wraps.length){
          var w = wraps[wraps.length-1];
          target = w.querySelector('.bubble') || w;
        }
        if (!target){
          var bubs = chat.querySelectorAll('.bubble.assistant');
          if (bubs && bubs.length) target = bubs[bubs.length-1];
        }
        if (!target) return;
        if (typeof window._storeBubblePayload === 'function'){
          try{ window._storeBubblePayload(target, p); }catch(_){}
        }
        try{ target.dataset.regenPayload = JSON.stringify(p); }catch(_){}
      }catch(_){}
    }

    // Helper: convert filename to proper URL path
    function _toMediaUrl(filename) {
      if (!filename) return '';
      var f = (typeof filename === 'string') ? filename : (filename.url || filename);
      // Already a full URL or path
      if (f.startsWith('http') || f.startsWith('/') || f.startsWith('data:')) return f;
      // Extract just filename if it's a full local path
      var basename = f.replace(/\\/g, '/').split('/').pop();
      // u_* files are in /uploads/, g_* files are in /media/
      if (basename.startsWith('u_')) return '/uploads/' + basename;
      if (basename.startsWith('g_')) return '/media/' + basename;
      // Default to /media/
      return '/media/' + basename;
    }

    function _detectMediaType(src) {
      var s = String(src || '').toLowerCase();
      if (!s) return 'application';
      if (s.indexOf('data:image/') === 0 || /\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(s)) return 'image';
      if (s.indexOf('data:video/') === 0 || /\.(mp4|webm|mov)(\?|#|$)/i.test(s)) return 'video';
      if (s.indexOf('data:audio/') === 0 || /\.(mp3|wav|ogg|flac|aac|m4a|opus|weba)(\?|#|$)/i.test(s)) return 'audio';
      return 'application';
    }

    var msgs = (payload && payload.messages) || [];
    
    // معالجة الرسائل مع البحث عن الملفات من used_payload في رسالة الـ assistant التالية
    for (var i = 0; i < msgs.length; i++) {
      var msg = msgs[i];
      try {
        if (msg.role === 'user'){
          if (Array.isArray(window.sendHistory)){
            var idx = window.sendHistory.length;
            
            // البحث عن الملفات المستخدمة فعلاً من used_payload في رسالة assistant التالية
            var usedFiles = [];
            var nextMsg = msgs[i + 1];
            if (nextMsg && nextMsg.role === 'assistant' && nextMsg.used_payload) {
              var imgList = nextMsg.used_payload.image_base64_list || [];
              usedFiles = imgList.map(function(f){
                var u = _toMediaUrl(f);
                return { url: u, data: u, type: _detectMediaType(u) };
              });
            }
            
            // إذا لم نجد في used_payload، نستخدم files من رسالة المستخدم
            if (!usedFiles.length && msg.files && msg.files.length) {
              usedFiles = msg.files.map(function(f){
                var u = _toMediaUrl(f);
                return { url: u, data: u, type: _detectMediaType(u) };
              });
            }
            
            window.sendHistory.push({ messageSent: msg.content||'', negPromptSent: null, filesSent: usedFiles });
            
            // إضافة الصور كفقاعات منفصلة (نفس سلوك الإرسال العادي)
            usedFiles.forEach(function(f){
              if (f.type === 'image' || f.type === 'video' || f.type === 'audio') {
                addBubble({ type: 'object', data: { type: f.type, data: f.url } }, 'user');
              }
            });
            
            // إضافة فقاعة النص مع الأزرار
            if (msg.content && msg.content.trim()) {
              addBubble(msg.content, 'user', { historyIndex: idx });
            }
            
          } else { addBubble(msg.content||'', 'user'); }
        } else if (msg.role === 'assistant'){
          if (typeof window.renderAssistantFull === 'function'){
            window.renderAssistantFull(msg);
            _attachRegenPayloadForLastAssistant(msg);
          } else {
            // pass through msg and neg_prompt so regen knows context
            renderAssistant(msg.content||'', msg, (msg.neg_prompt!=null?msg.neg_prompt:null));
            _attachRegenPayloadForLastAssistant(msg);
          }
          // ✨ Multi-result: render extra results saved in session history
          if (Array.isArray(msg.extra_results)) {
            for (var ei = 0; ei < msg.extra_results.length; ei++) {
              var extra = msg.extra_results[ei];
              if (extra) {
                renderAssistant(extra, msg, (msg.neg_prompt!=null?msg.neg_prompt:null));
                _attachRegenPayloadForLastAssistant(msg);
              }
            }
          }
        }
      } catch(e){ console.warn('apply msg failed', e); }
    }
    // After rendering restored messages, ensure user bubbles have the resend/edit buttons
    try {
      (function attachButtonsForRestored(){
        try{
          var chatEl = chat; if (!chatEl) return;
          if (!Array.isArray(window.sendHistory) || !window.sendHistory.length) return;
          var used = Object.create(null);
          var userMsgs = chatEl.querySelectorAll('.msg.user');
          userMsgs.forEach(function(msgEl){
            try{
              var bub = msgEl.querySelector('.bubble'); if (!bub) return;
              if (bub.querySelector && (bub.querySelector('.user-regen-btn') || bub.querySelector('.user-edit-btn'))) return;
              var text = (bub.textContent || '').trim(); if (!text) return;
              for (var i=0;i<window.sendHistory.length;i++){
                if (used[i]) continue;
                var rec = window.sendHistory[i]; if (!rec) continue;
                if (String((rec.messageSent||'')).trim() === text){
                  used[i] = true;
                  // create resend button
                  try{
                    var ubtn = document.createElement('button');
                    ubtn.className = 'user-regen-btn'; ubtn.title = _t('chat.resend', 'إعادة إرسال'); ubtn.textContent = '⟳';
                    (function(idx){ ubtn.addEventListener('click', function(ev){ ev.stopPropagation(); try{ resendUserNoFiles ? resendUserNoFiles(idx) : resendUser(idx); }catch(_){ try{ resendUser(idx); }catch(_){}} }); })(i);
                    bub.insertBefore(ubtn, bub.firstChild || null);
                  }catch(_){ }
                  // create edit button
                  try{
                    var ebtn = document.createElement('button');
                    ebtn.className = 'user-edit-btn'; ebtn.title = _t('chat.edit_resend', 'تعديل وإعادة إرسال'); ebtn.textContent = '✎';
                    (function(idx){ ebtn.addEventListener('click', function(ev){ ev.stopPropagation(); try{ openEditMsgModal(idx); }catch(_){}}); })(i);
                    bub.insertBefore(ebtn, bub.firstChild ? bub.firstChild.nextSibling : null);
                  }catch(_){ }
                  break;
                }
              }
            }catch(_){ }
          });
        }catch(_){ }
      })();
    }catch(_){ }
  }
  function restoreLastSessionIfAny(opts){
    opts = opts || {};
    if (window.__RESTORE_FLOW_ACTIVE__) return Promise.resolve(false);
    if ((getUsername()||'guest') === 'guest') return Promise.resolve(false);
    window.__RESTORE_FLOW_ACTIVE__ = true;
    var sid = pickSessionIdToRestore({ preferServerList: !!opts.preferServerList });
    if (!sid){ window.__RESTORE_FLOW_ACTIVE__ = false; return Promise.resolve(false); }
    try { if (typeof window.showRestoringUI === 'function') window.showRestoringUI(); } catch(e){}
    return fetchSession(sid, getUsername())
      .then(function(payload){ applySessionPayload(payload, sid); return true; })
      .catch(function(e){ console.warn('restore failed', e); return false; })
      .then(function(ok){
        try { if (typeof window.hideRestoringUI === 'function') window.hideRestoringUI(); } catch(e){}
        window.__RESTORE_FLOW_ACTIVE__ = false;
        try { document.dispatchEvent(new CustomEvent('sessionRestored', { detail:{ ok:ok, session_id: sid } })); } catch(e){}
        return ok;
      });
  }
  window.restoreLastSessionIfAny = restoreLastSessionIfAny;

  // ---------------- Login & wiring ----------------
  window.loginNow = function(){
    if (window.__LOGIN_FLOW_ACTIVE__) return;
    window.__LOGIN_FLOW_ACTIVE__ = true;
    cancelInFlight();
    var u = readInputName() || 'guest';
    if (u === 'guest'){ window.__LOGIN_FLOW_ACTIVE__ = false; alert(_t('sessions.err_login_guest', 'لا يمكن تسجيل دخول باسم guest')); return; }
    setUsername(u);
    // أظهر واجهة الاسترجاع مبكراً لتفادي الشاشة الفارغة قبل اكتمال التحميل
    try { if (typeof window.showRestoringUI === 'function') window.showRestoringUI(); } catch(e){}
    Promise.resolve()
      .then(function(){
        // تسريع: ابدأ استرجاع الجلسة فورًا من localStorage بالتوازي مع تحميل الإعدادات/القائمة
        var fastRestore = restoreLastSessionIfAny({ preferServerList: false });
        var warmup = Promise.all([window.loadUserSettings(), window.loadUserSessions()]);
        return Promise.all([fastRestore, warmup]).then(function(pair){
          var restoredFast = !!(pair && pair[0]);
          if (restoredFast) return true;
          // fallback: إذا لا يوجد session_id محلي جرّب اختيار أول جلسة من قائمة السيرفر
          return restoreLastSessionIfAny({ preferServerList: true });
        });
      })
      .then(function(){
        // لا نعمل reload هنا لتجنب دورة تحميل إضافية بطيئة
        try { if (typeof window.hideRestoringUI === 'function') window.hideRestoringUI(); } catch(_){ }
        try { window.__LOGIN_FLOW_ACTIVE__ = false; } catch(_){}
      })
      .catch(function(e){
        console.warn('login flow failed', e);
        try { if (typeof window.hideRestoringUI === 'function') window.hideRestoringUI(); } catch(_){}
        window.__LOGIN_FLOW_ACTIVE__ = false;
      });
  };

  document.addEventListener('click', function(ev){
    var t = ev.target; if (!t) return;
    if (t.closest && t.closest('#loginBtn')){ ev.preventDefault(); window.loginNow(); return; }
    if (t.closest && t.closest('#newSessionBtn')){ ev.preventDefault(); window.newSession(); return; }
    if (t.closest && t.closest('#saveSettingsBtn')){ ev.preventDefault(); window.saveUserSettings(); return; }
	if (t.closest && t.closest('#clearSessionsBtn')){ ev.preventDefault(); window.clearAllSessions(); return; }
    if (t.classList && t.classList.contains('session-load')){
      var sid = t.getAttribute('data-id'); if (sid){ try { localStorage.session_id = sid; } catch(e){} }
      // تحميل مباشر بدون إعادة تحميل الصفحة (أسرع)
      restoreLastSessionIfAny({ preferServerList: false }).then(function(){
        try { window.loadUserSessions && window.loadUserSessions(); } catch(_){ }
      });
      return;
    }
    if (t.classList && t.classList.contains('session-delete')){
      var sid2 = t.getAttribute('data-id'); if (sid2){ window.deleteSession(sid2); }
      return;
    }
  }, false);

  // ========== NEW: Force /chat requests to carry the current session id ==========
  // helper accessor (can be used by other scripts too)
  window.getSessionIdForRequests = function(){
    try { return (window.currentSessionId || localStorage.session_id || '').trim(); } catch(_){ return (window.currentSessionId||''); }
  };
  function shouldAttachSessionHeader(url){
    try{
      if (!url) return false;
      var u = new URL(String(url), window.location.origin);
      // attach only for same-origin /chat endpoint to avoid CORS on external services (e.g., OLLAMA)
      if (u.origin !== window.location.origin) return false;
      return /\/chat(\?|$)/.test(u.pathname);
    }catch(_){ return false; }
  }
  (function installSessionIdAutoHeader(){
    try{
      // Patch fetch
      var _origFetch = window.fetch && window.fetch.bind(window);
      if (_origFetch){
        window.fetch = function(input, init){
          try{
            var url = (typeof input==='string')? input : (input && input.url) || '';
            if (shouldAttachSessionHeader(url)){
              init = init || {};
              var hdrs = new Headers(init.headers || (input && input.headers) || {});
              var sid = window.getSessionIdForRequests();
              if (sid && !hdrs.has('X-Session-ID')) hdrs.set('X-Session-ID', sid);
              init.headers = hdrs;
            }
          }catch(_){}
          return _origFetch(input, init);
        };
      }
      // Patch XHR as well (in case some code uses it)
      var XHR = window.XMLHttpRequest;
      if (XHR && XHR.prototype){
        var _open = XHR.prototype.open;
        var _send = XHR.prototype.send;
        XHR.prototype.__sessionTargetUrl = '';
        XHR.prototype.open = function(method, url){
          try{ this.__sessionTargetUrl = url || ''; }catch(_){}
          return _open.apply(this, arguments);
        };
        XHR.prototype.send = function(body){
          try{
            if (shouldAttachSessionHeader(this.__sessionTargetUrl)){
              var sid = window.getSessionIdForRequests();
              if (sid) this.setRequestHeader('X-Session-ID', sid);
            }
          }catch(_){}
          return _send.apply(this, arguments);
        };
      }
    }catch(_){}
  })();
  // ==============================================================================

  // ---------------- Bootstrap (after refresh) ----------------
  function boot(){
    if (window.__LOGIN_FLOW_ACTIVE__) return;
    window.__LOGIN_FLOW_ACTIVE__ = true;
    cancelInFlight();
    var u = 'guest';
    try { u = (localStorage.getItem('easyui:last_username') || localStorage.username || 'guest') || 'guest'; } catch(e){}
    u = String(u||'').trim() || 'guest';
    setUsername(u);
    // أظهر واجهة الاسترجاع أثناء bootstrap حتى لا تبقى الصفحة فارغة
    // (يتم إخفاؤها بعد نهاية التدفق حتى لو لم توجد جلسة)
    if (u !== 'guest') {
      try { if (typeof window.showRestoringUI === 'function') window.showRestoringUI(); } catch(e){}
    }
    Promise.resolve()
      .then(function(){
        // تسريع: استرجاع فوري من localStorage بالتوازي مع تحميل الإعدادات والجلسات
        var fastRestore = (u !== 'guest') ? restoreLastSessionIfAny({ preferServerList: false }) : Promise.resolve(false);
        var warmup = Promise.all([window.loadUserSettings(), window.loadUserSessions()]);
        return Promise.all([fastRestore, warmup]).then(function(pair){
          var restoredFast = !!(pair && pair[0]);
          if (restoredFast) return true;
          return restoreLastSessionIfAny({ preferServerList: true });
        });
      })
      .catch(function(e){ console.warn('bootstrap failed', e); })
      .then(function(){
        try { if (typeof window.hideRestoringUI === 'function') window.hideRestoringUI(); } catch(_){}
        window.__LOGIN_FLOW_ACTIVE__ = false;
      });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();

})();
