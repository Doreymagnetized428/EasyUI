/* ============================================================
   Assistant Regen (new assistant bubble → spinner → result)
   - إن وُجدت حمولة محفوظة للفقاعة المُعاد توليدها → يُعاد الإرسال
     بنفس الـworkflow والمتغيرات تمامًا (نعدّل session_id فقط).
   - وإلا: نجمع كل وسائط الإدخال من كل فقاعات المستخدم المتتالية
     + sendHistory + فقاعة المساعد الحالية كبديل، مع دمج بدون تكرار.
   - لا نعرض فقاعات إدخال؛ فقط فقاعة مساعد جديدة بسبينر تتحول للنتيجة.
   - نعيد زر ⟳ أعلى النتيجة/الخطأ دائمًا.
   ============================================================ */
'use strict';

/* خريطة ضعيفة لتخزين حمولة الإرسال لكل فقاعة مساعد */
const __regenPayloadMap = new WeakMap();

/* ===================== Helpers: Origin & Paths ===================== */
function _getApiOrigin() {
  try { return new URL(API_BASE, window.location.href).origin; }
  catch { return window.location.origin; }
}
function _fixMediaPath(s) {
  // ⚠️ لا تغييرات قسرية الآن: لا نستبدل /uploads/ بـ /media/
  return s;
}
function _toAbsoluteOnApi(s) {
  try {
    if (typeof s === 'string' && s.startsWith('/')) {
      return new URL(s, _getApiOrigin()).href;
    }
  } catch {}
  return s;
}
const _isUploadsPath = (s)=> typeof s === 'string' && /^\/uploads\//i.test(s);
const _isMediaPath   = (s)=> typeof s === 'string' && /^\/media\//i.test(s);

/* ===================== Helpers: Media Detection/Conversion ===================== */
function _isDataURL(s){ return typeof s === 'string' && /^data:[^;]+;base64,/i.test(s); }
function _isImageDataURL(s){ return typeof s === 'string' && /^data:image\//i.test(s); }
function _isVideoDataURL(s){ return typeof s === 'string' && /^data:video\//i.test(s); }
function _isAudioDataURL(s){ return typeof s === 'string' && /^data:audio\//i.test(s); }
function _isHttpOrMediaPath(s){ return typeof s === 'string' && (/^https?:\/\//i.test(s) || /^\/(media|uploads)\//i.test(s)); }
function _extOf(s){ try { return String(s).split('?')[0].split('#')[0].toLowerCase(); } catch { return ''; } }
function _isImageName(s){ return /\.(png|jpe?g|gif|webp|svg)$/i.test(_extOf(s)); }
function _isVideoName(s){ return /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(_extOf(s)); }
function _isAudioName(s){ return /\.(mp3|wav|aac|m4a|ogg|flac|opus)$/i.test(_extOf(s)); }
function _looksBase64(s){ return typeof s === 'string' && !/^data:/i.test(s) && /^[A-Za-z0-9+/=\r\n]+$/.test(s) && s.length > 512; }

// مصدر عرض لعناصر <img>/<video>/<audio>
function _toDisplaySrc(src) {
  if (!src) return '';
  if (_looksBase64(src)) return `data:image/png;base64,${src}`; // نفترض صورة
  if (_isDataURL(src)) return src;
  return _toAbsoluteOnApi(_fixMediaPath(src));
}

// جلب URL/مسار → DataURL (للإرسال كـ base64)
async function _urlToDataURL(url) {
  const abs = _toAbsoluteOnApi(_fixMediaPath(url));
  const res = await fetch(abs, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`fetch-failed ${res.status}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result); // data:<mime>;base64,...
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// نسخة "خام" لا تُجري _fixMediaPath — ضرورية لمسارات /uploads/
async function _urlToDataURL_raw(url) {
  const abs = new URL(url, _getApiOrigin()).href;
  const res = await fetch(abs, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`fetch-failed ${res.status}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/* ===================== De-dup Helpers ===================== */
function _normSrcKey(s){
  if (!s) return '';
  if (_isDataURL(s)) {
    const len = s.length;
    const head = s.slice(0, 128);
    const tail = s.slice(-128);
    return `data:${len}:${head}:${tail}`;
  }
  return _toAbsoluteOnApi(_fixMediaPath(s));
}
function _mergeUnique(/* arrays... */){
  const out = [];
  const seen = new Set();
  for (const arr of arguments) {
    const a = Array.isArray(arr) ? arr : [];
    for (const x of a) {
      const k = _normSrcKey(x);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

/* ===================== UI & History ===================== */
function _extractUserTextFromBubble(userBubbleEl) {
  if (!userBubbleEl) return '';
  const clone = userBubbleEl.cloneNode(true);
  clone.querySelectorAll('button').forEach(btn => btn.remove());
  clone.querySelectorAll('img, video, audio').forEach(m => m.remove());
  return (clone.textContent || '').trim();
}
function _findHistoryByMessage(message) {
  if (!Array.isArray(sendHistory) || !message) return null;
  for (let i = sendHistory.length - 1; i >= 0; i--) {
    const rec = sendHistory[i];
    if (rec && (rec.messageSent || '') === message) return { rec, index: i };
  }
  return null;
}
function _getContiguousUserBubblesBefore(assistantWrap){
  const bubbles = [];
  let el = assistantWrap.previousElementSibling;
  while (el && !el.classList.contains('assistant')) {
    if (el.classList.contains('user')) {
      const b = el.querySelector('.bubble');
      if (b) bubbles.unshift(b);
    }
    el = el.previousElementSibling;
  }
  return bubbles;
}
function _getHistoryRecFromBubble(userBubble){
  if (!userBubble) return null;
  const idx = userBubble.dataset && userBubble.dataset.historyIndex;
  if (idx != null && Array.isArray(sendHistory) && sendHistory[idx]) {
    return { rec: sendHistory[idx], index: Number(idx) };
  }
  const txt = _extractUserTextFromBubble(userBubble);
  return _findHistoryByMessage(txt);
}

/* جامع وسائط من DOM لأي فقاعة */
async function _mediaFromBubbleElAsData(anyBubbleEl){
  const out = { images: [], videos: [], audios: [] };
  if (!anyBubbleEl) return out;

  for (const img of anyBubbleEl.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (!src) continue;
    try { out.images.push(_isDataURL(src) ? src : await _urlToDataURL(src)); } catch {}
  }
  for (const v of anyBubbleEl.querySelectorAll('video')) {
    const src = v.getAttribute('src') || (v.querySelector('source')?.getAttribute('src') || '');
    if (!src) continue;
    try { out.videos.push(_isDataURL(src) ? src : await _urlToDataURL(src)); } catch {}
  }
  for (const a of anyBubbleEl.querySelectorAll('audio')) {
    const src = a.getAttribute('src') || (a.querySelector('source')?.getAttribute('src') || '');
    if (!src) continue;
    try { out.audios.push(_isDataURL(src) ? src : await _urlToDataURL(src)); } catch {}
  }
  return out;
}

/* وسائط من السجل كـ DataURL */
async function _mediaFromHistoryAsData(rec) {
  const out = { images: [], videos: [], audios: [] };
  if (!rec || !Array.isArray(rec.filesSent)) return out;

  for (const f of rec.filesSent) {
    // accept multiple shapes: plain string, {data}, {url}, {src}
    const src = (typeof f === 'string') ? f : (f && (f.data || f.url || f.src)) || '';
    if (!src) continue;

    const mime = (f?.type || '').toLowerCase();
    let kind = (mime.startsWith('image/') && 'image') || (mime.startsWith('video/') && 'video') || (mime.startsWith('audio/') && 'audio') || 'other';
    if (kind === 'other') {
      if (_isImageName(src)) kind = 'image';
      else if (_isVideoName(src)) kind = 'video';
      else if (_isAudioName(src)) kind = 'audio';
    }

    try {
      if (_isDataURL(src)) {
        if (kind === 'image') out.images.push(src);
        else if (kind === 'video') out.videos.push(src);
        else if (kind === 'audio') out.audios.push(src);
      } else if (_isHttpOrMediaPath(src)) {
        const d = await _urlToDataURL(src);
        if (kind === 'image') out.images.push(d);
        else if (kind === 'video') out.videos.push(d);
        else if (kind === 'audio') out.audios.push(d);
      }
    } catch {}
  }
  return out;
}

/* ===================== Payload capture/extraction ===================== */
function _extractEffectivePayloadFromResponse(data) {
  const cands = [
    data && data.used_payload,
    data && data.payload,
    data && data.request,
    data && data.input_payload,
    data && data.echo,
    data && data.meta && data.meta.used_payload,
    data && data.meta && data.meta.payload,
    data && data.meta && data.meta.request,
    data && data.result && data.result.used_payload
  ];
  for (const c of cands) {
    if (c && typeof c === 'object') return c;
  }
  return null;
}

// تخزين حمولة الفقاعة في WeakMap + dataset (نسخة خفيفة)
function _storeBubblePayload(bubble, payload) {
  try { __regenPayloadMap.set(bubble, payload); } catch {}
  try {
    // نحفظ نسخة كاملة - المسارات قصيرة (/uploads/filename)
    // فقط نختصر الـ base64 الطويلة (أكثر من 500 حرف)
    const light = JSON.parse(JSON.stringify(payload, (k, v) => {
      if (typeof v === 'string' && v.length > 500 && v.startsWith('data:')) {
        return `[base64:${v.length}]`;
      }
      return v;
    }));
    bubble.dataset.regenPayload = JSON.stringify(light);
  } catch {}
}
function _getBubbleStoredPayload(bubble) {
  const m = __regenPayloadMap.get(bubble);
  if (m && typeof m === 'object') return m;
  try {
    const s = bubble?.dataset?.regenPayload;
    if (s) return JSON.parse(s);
  } catch {}
  return null;
}

/* ===================== جمع المدخلات ===================== */
function _deepClone(o){ try { return JSON.parse(JSON.stringify(o)); } catch { return {}; } }

async function _collectAllInputsForRegen(assistantWrap) {
  const myBubble = assistantWrap.querySelector('.bubble');

  // A) لو للفقاعة حمولة محفوظة → استخدمها كما هي
  const stored = _getBubbleStoredPayload(myBubble);
  if (stored && typeof stored === 'object') {
    return {
      source: 'assistant-bubble-payload',
      message: stored.message || '',
      negPrompt: (stored.neg_prompt != null ? stored.neg_prompt : null),
      media: {
        images: stored.image_base64_list || [],
        videos: stored.video_base64_list || [],
        audios: stored.audio_base64_list || []
      },
      basePayload: _deepClone(stored)
    };
  }

  // B) لا توجد حمولة محفوظة → اجمع من فقاعات المستخدم
  const userBubbles = _getContiguousUserBubblesBefore(assistantWrap);
  const lastUserBubble = userBubbles.length ? userBubbles[userBubbles.length - 1] : null;
  const positiveText = _extractUserTextFromBubble(lastUserBubble) || '';

  let negPrompt = null;
  let basePayload = {};
  for (let i = userBubbles.length - 1; i >= 0; i--) {
    const h = _getHistoryRecFromBubble(userBubbles[i]);
    if (h && h.rec) {
      if (negPrompt == null && h.rec.negPromptSent != null) negPrompt = h.rec.negPromptSent;
      if (Object.keys(basePayload).length === 0 && (h.rec.payloadSent || h.rec.rawPayload)) {
        basePayload = _deepClone(h.rec.payloadSent || h.rec.rawPayload || {});
      }
      if (negPrompt != null && Object.keys(basePayload).length) break;
    }
  }

  let allImgs = [], allVids = [], allAudios = [];
  for (const ub of userBubbles) {
    const domMed = await _mediaFromBubbleElAsData(ub);
    allImgs = _mergeUnique(allImgs, domMed.images);
    allVids = _mergeUnique(allVids, domMed.videos);
    allAudios = _mergeUnique(allAudios, domMed.audios);

    const h = _getHistoryRecFromBubble(ub);
    if (h && h.rec) {
      const histMed = await _mediaFromHistoryAsData(h.rec);
      allImgs = _mergeUnique(allImgs, histMed.images);
      allVids = _mergeUnique(allVids, histMed.videos);
      allAudios = _mergeUnique(allAudios, histMed.audios);
    }
  }

  // بديل: من فقاعة المساعد الحالية إن لم نجد شيئًا
  if (!allImgs.length && !allVids.length && !allAudios.length) {
    const assMed = await _mediaFromBubbleElAsData(myBubble);
    allImgs = _mergeUnique(allImgs, assMed.images);
    allVids = _mergeUnique(allVids, assMed.videos);
    allAudios = _mergeUnique(allAudios, assMed.audios);
  }

  return {
    source: 'collected',
    message: positiveText,
    negPrompt,
    media: { images: allImgs, videos: allVids, audios: allAudios },
    basePayload
  };
}

/* ===================== تحويل المسارات داخل image_base64_list إلى Base64 ===================== */
async function ensureImageBase64InPayload(payload){
  if (!payload || !Array.isArray(payload.image_base64_list)) return payload;

  const input = payload.image_base64_list;
  const out = [];

  for (let s of input) {
    if (!s) continue;

    // جاهز أصلاً
    if (_isDataURL(s)) { out.push(s); continue; }

    // خام base64 بدون data: → نلفّه كصورة
    if (_looksBase64(s)) { out.push(`data:image/png;base64,${s}`); continue; }

    // /uploads/* ← استخدم raw حتى لا تتحوّل تلقائياً إلى /media
    if (_isUploadsPath(s)) {
      try { out.push(await _urlToDataURL_raw(s)); } catch {}
      continue;
    }

    // /media/* أو http(s) ← تحويل قياسي
    if (_isMediaPath(s) || /^https?:\/\//i.test(s)) {
      try { out.push(await _urlToDataURL(s)); } catch {}
      continue;
    }

    // اسم ملف مجرد (u_xxx أو g_xxx) — جرّب /uploads أولاً ثم /media
    const bn = String(s).trim();
    if (/^[ug]_[a-f0-9]{32}\.(png|jpe?g|gif|webp)$/i.test(bn)) {
      try { out.push(await _urlToDataURL_raw('/uploads/' + bn)); continue; } catch {}
      try { out.push(await _urlToDataURL('/media/' + bn)); continue; } catch {}
      continue;
    }

    // أي صيغة أخرى لا يمكن تحويلها من المتصفح (مثل مسارات نظام Windows)
    // نتجاهلها بصمت.
  }

  payload.image_base64_list = out;
  return payload;
}

/* ===================== Toolbar (إرجاع زر ⟳ بعد العرض) ===================== */
const _t022 = (key, fallback, params) => {
  try { return window.t ? window.t(key, fallback, params) : fallback; } catch(e) { return fallback; }
};

function _ensureRegenBar(bubble){
  if (!bubble) return;
  let bar = bubble.querySelector('.msg-actions');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'msg-actions';
    bubble.prepend(bar);
  }
  if (!bar.querySelector('.regen-btn')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'regen-btn';
    btn.title = _t022('chat.regen', 'إعادة التوليد');
    btn.textContent = '⟳';
    bar.appendChild(btn);
  }
}

/* ===================== Renderers ===================== */
function _renderErrorInto(bubble, text){
  bubble.classList.remove('wait-bubble');
  bubble.innerHTML = '';
  _ensureRegenBar(bubble);
  const p = document.createElement('div');
  p.textContent = text || _t022('errors.unexpected', 'حدث خطأ غير متوقع.');
  p.className = 'error-text';
  bubble.appendChild(p);
}

function _renderResultInto(bubble, result) {
  bubble.classList.remove('wait-bubble');
  bubble.innerHTML = '';

  _ensureRegenBar(bubble);

  const appendText = (t)=>{
    const p = document.createElement('p');
    p.textContent = String(t || '');
    bubble.appendChild(p);
  };
  const appendImg = (src)=>{
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = _toDisplaySrc(src);
    img.style.maxWidth = '100%';
    img.style.borderRadius = '12px';
    // Keep same behavior as assistant image bubbles in normal render
    try {
      if (Array.isArray(window.chatMedia)) {
        img.dataset.idx = window.chatMedia.length;
        window.chatMedia.push({ type: 'image', src: img.src });
        img.onclick = () => {
          try {
            if (typeof window.openLightbox === 'function') {
              window.openLightbox(+img.dataset.idx);
            }
          } catch(_){}
        };
      }
    } catch(_){}

    bubble.style.position = 'relative';

    // Mask editor button
    const maskBtn = document.createElement('button');
    maskBtn.textContent = '🎨';
    maskBtn.title = _t022('chat.open_mask_editor', 'فتح محرر الأقنعة');
    maskBtn.style.position = 'absolute';
    maskBtn.style.top = '8px';
    maskBtn.style.right = '48px';
    maskBtn.style.width = '32px';
    maskBtn.style.height = '32px';
    maskBtn.style.border = 'none';
    maskBtn.style.borderRadius = '50%';
    maskBtn.style.background = '#ff9800cc';
    maskBtn.style.color = '#fff';
    maskBtn.style.fontSize = '20px';
    maskBtn.style.display = 'flex';
    maskBtn.style.alignItems = 'center';
    maskBtn.style.justifyContent = 'center';
    maskBtn.style.cursor = 'pointer';
    maskBtn.style.boxShadow = '0 0 6px #ff9800aa';
    maskBtn.onmouseover = () => { maskBtn.style.background = '#fb8c00'; };
    maskBtn.onmouseout = () => { maskBtn.style.background = '#ff9800cc'; };
    maskBtn.onclick = () => {
      try {
        if (typeof files !== 'undefined' && Array.isArray(files)) {
          files.push({
            name: 'assistant_image.png',
            type: 'image',
            size: (img.src || '').length,
            data: img.src
          });
          if (typeof renderFilePreviews === 'function') renderFilePreviews();
          if (typeof window.openMaskEditor === 'function') {
            window.openMaskEditor(files.length - 1);
          }
        }
      } catch(_){}
    };

    // Send-to-bar button
    const sendBtn = document.createElement('button');
    sendBtn.textContent = '↩';
    sendBtn.title = _t022('chat.send_to_bar', 'إرسال للبار');
    sendBtn.style.position = 'absolute';
    sendBtn.style.top = '8px';
    sendBtn.style.right = '88px';
    sendBtn.style.width = '32px';
    sendBtn.style.height = '32px';
    sendBtn.style.border = 'none';
    sendBtn.style.borderRadius = '50%';
    sendBtn.style.background = '#4caf50cc';
    sendBtn.style.color = '#fff';
    sendBtn.style.fontSize = '18px';
    sendBtn.style.display = 'flex';
    sendBtn.style.alignItems = 'center';
    sendBtn.style.justifyContent = 'center';
    sendBtn.style.cursor = 'pointer';
    sendBtn.style.boxShadow = '0 0 6px #4caf50aa';
    sendBtn.style.transform = 'scaleX(-1)';
    sendBtn.onmouseover = () => { sendBtn.style.background = '#43a047'; };
    sendBtn.onmouseout = () => { sendBtn.style.background = '#4caf50cc'; };
    sendBtn.onclick = async () => {
      try {
        if (typeof files === 'undefined' || !Array.isArray(files)) return;
        let dataUrl = img.src || '';
        if (!_isDataURL(dataUrl)) {
          try { dataUrl = await _urlToDataURL(dataUrl); } catch(_) { dataUrl = ''; }
        }
        if (!dataUrl || !_isDataURL(dataUrl)) return;
        files.push({
          name: 'chat_image.png',
          type: 'image',
          size: dataUrl.length,
          data: dataUrl
        });
        if (typeof renderFilePreviews === 'function') renderFilePreviews();
        if (typeof updateSend === 'function') updateSend();
      } catch(_){}
    };

    bubble.appendChild(img);
    bubble.appendChild(maskBtn);
    bubble.appendChild(sendBtn);
  };
  const appendVideo = (src)=>{
    const v = document.createElement('video');
    v.controls = true;
    v.playsInline = true;
    v.src = _toDisplaySrc(src);
    v.style.maxWidth = '100%';
    v.style.borderRadius = '12px';
    bubble.appendChild(v);
  };
  const appendAudio = (src)=>{
    bubble.style.position = 'relative';
    const a = document.createElement('audio');
    a.controls = true;
    a.src = _toDisplaySrc(src);
    a.style.marginTop = '34px';
    a.style.marginBottom = '-20px';
    bubble.appendChild(a);

    const btn = document.createElement('button');
    btn.className = 'regen-btn';
    btn.textContent = '⟳';
    btn.title = _t022('chat.regen', 'إعادة التوليد');
    bubble.appendChild(btn);
  };

  if (result == null) { appendText(''); return; }

  if (typeof result === 'string') {
    const s = result;
    if (_isAudioDataURL(s) || _isAudioName(s)) { appendAudio(s); return; }
    if (_isVideoDataURL(s) || _isVideoName(s)) { appendVideo(s); return; }
    if (_isImageDataURL(s) || _isImageName(s)) { appendImg(s); return; }
    if (_isHttpOrMediaPath(s)) {
      if (_isAudioName(s)) { appendAudio(s); return; }
      if (_isVideoName(s)) { appendVideo(s); return; }
      appendImg(s); return;
    }
    if (_isVideoName(s)) { appendVideo(s); return; }
    if (_isAudioName(s)) { appendAudio(s); return; }
    if (_looksBase64(s)) { appendImg(s); return; }
    appendText(s); return;
  }

  if (Array.isArray(result)) {
    for (const item of result) _renderResultInto(bubble, item);
    return;
  }

  if (typeof result.type === 'string' && typeof result.data === 'string') {
    const t = result.type.toLowerCase();
    if (t === 'image') { appendImg(result.data); return; }
    if (t === 'video') { appendVideo(result.data); return; }
    if (t === 'audio') { appendAudio(result.data); return; }
  }

  if (Array.isArray(result.images)) { for (const s of result.images) appendImg(s); }
  if (Array.isArray(result.videos)) { for (const s of result.videos) appendVideo(s); }
  if (Array.isArray(result.audios)) { for (const s of result.audios) appendAudio(s); }

  const maybeMedia = result.image || result.url || result.path || result.data;
  if (typeof maybeMedia === 'string') {
    if (_isAudioDataURL(maybeMedia) || _isAudioName(maybeMedia)) {
      appendAudio(maybeMedia);
      return;
    }
    if (_isVideoDataURL(maybeMedia) || _isVideoName(maybeMedia)) {
      appendVideo(maybeMedia);
      return;
    }
    if (_isImageDataURL(maybeMedia) || _isHttpOrMediaPath(maybeMedia) || _isImageName(maybeMedia) || _looksBase64(maybeMedia)) {
      appendImg(maybeMedia);
      return;
    }
  }

  if (typeof result.text === 'string') {
    appendText(result.text);
  }

  if (!bubble.childNodes.length) {
    appendText(JSON.stringify(result));
  }
}

/* ===================== Session Helpers ===================== */
function _ensureCurrentSessionId(){
  if (typeof currentSessionId === 'string' && currentSessionId.trim()) return currentSessionId;
  const sid = 's_' + Date.now();
  try { window.currentSessionId = sid; } catch(e){}
  return sid;
}

/* ===================== Main: Regen Flow ===================== */
async function _handleAssistantRegen(ev) {
  try {
    const btn = ev.target.closest('.regen-btn');
    if (!btn) return;
    const srcAssistantWrap = btn.closest('.msg.assistant');
    if (!srcAssistantWrap) return;

    ev.preventDefault();
    ev.stopPropagation();

    const prevDisabled = btn.disabled;
    btn.disabled = true;

    // 1) فقاعة انتظار جديدة
    const waitWrap = addBubble('', 'assistant', { forceScroll: true });
    const waitBubble = waitWrap.querySelector('.bubble');
    waitBubble.innerHTML = '<div class="spinner"></div>';
    waitBubble.classList.add('wait-bubble');

    // 2) اجمع المدخلات (أو استخدم حمولة الفقاعة إن كانت محفوظة)
    // 2) اجمع المدخلات (أو استخدم حمولة الفقاعة إن كانت محفوظة)
    const collected = await _collectAllInputsForRegen(srcAssistantWrap);


  // 3) استخدم نفس session_id للجلسة الحالية
  const sid = _ensureCurrentSessionId();

    // 4) بناء الحمولة
    let payload;
    if (collected.source === 'assistant-bubble-payload') {
      payload = Object.assign({}, collected.basePayload, { session_id: sid, is_regeneration: true });
      if (typeof currentUsername !== 'undefined' && currentUsername != null) payload.username = currentUsername;
      if (typeof mode !== 'undefined' && mode != null && payload.workflow_choice == null) payload.workflow_choice = mode;
    } else {
      const { message, negPrompt, media, basePayload } = collected;
      payload = Object.assign({}, basePayload, {
        message: message || basePayload.message || '',
        neg_prompt: (negPrompt != null ? negPrompt : basePayload.neg_prompt || null),
        workflow_choice: (typeof mode !== 'undefined' ? mode : basePayload.workflow_choice || null),
        username: (typeof currentUsername !== 'undefined' ? currentUsername : basePayload.username || null),
        session_id: sid,
        is_regeneration: true,
        image_base64_list: _mergeUnique(basePayload.image_base64_list || [], media.images || []),
        video_base64_list: _mergeUnique(basePayload.video_base64_list || [], media.videos || []),
        audio_base64_list: _mergeUnique(basePayload.audio_base64_list || [], media.audios || [])
      });
    }

    // ✅ هنا: حوّل كل /uploads/* أو مسارات إلى Base64 قبل الإرسال
    payload = await ensureImageBase64InPayload(payload);

    // خزّن الحمولة لهذه الفقاعة الجديدة حتى تكون إعادة التوليد مطابقة لاحقًا
    _storeBubblePayload(waitBubble, payload);

    // 5) إرسال — نرسل نفس session_id في الهيدر أيضًا
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sid
      },
      body: JSON.stringify(payload)
    });

    let data = null;
    try { data = await res.json(); } catch {}

    if (!res.ok || !data || data.error) {
      _renderErrorInto(waitBubble, data?.error || _t022('chat.regen_http_failed', '❌ فشل إعادة التوليد (HTTP {status})', { status: res.status }));
    } else {
      // 6) عرض النتيجة
      _renderResultInto(waitBubble, data.result);

      // ✨ Multi-result: render extra results as additional assistant bubbles
      const _extraBubbles = [];
      if (Array.isArray(data.extra_results)) {
        for (const extra of data.extra_results) {
          if (!extra) continue;
          const extraWrap = addBubble('', 'assistant', { forceScroll: true });
          const extraBub = extraWrap.querySelector('.bubble');
          if (extraBub) {
            _renderResultInto(extraBub, extra);
            // Copy payload so ⟳ works on extra bubbles too
            _storeBubblePayload(extraBub, payload);
            _extraBubbles.push(extraBub);
          }
        }
      }

      // 7) لو الخادم أعاد used_payload/echo → حدّث المخزن لالتقاط أي متغيرات نهائية
      const effective = _extractEffectivePayloadFromResponse(data);
      if (effective && typeof effective === 'object') {
        if (!effective.session_id) effective.session_id = sid;
        _storeBubblePayload(waitBubble, effective);
        for (const b of _extraBubbles) {
          try { _storeBubblePayload(b, effective); } catch(_){ }
        }
      }
    }

    btn.disabled = prevDisabled;

  } catch (e) {
    const lastAssistant = document.querySelector('.msg.assistant:last-of-type .bubble');
    if (lastAssistant) _renderErrorInto(lastAssistant, _t022('chat.regen_failed_unexpected', '❌ فشل إعادة التوليد: خطأ غير متوقع.'));
  }
}

// تصدير الدالة لاستخدامها من ملفات أخرى (مثل استعادة الجلسات)
window._storeBubblePayload = _storeBubblePayload;
window._getBubbleStoredPayload = _getBubbleStoredPayload;

/* ===================== Event Delegation (once) ===================== */
(function _installAssistantRegenInterceptorOnce() {
  if (window.__assistantRegenInterceptorInstalled__) return;
  window.__assistantRegenInterceptorInstalled__ = true;

  document.addEventListener('click', function(ev) {
    const t = ev.target;
    if (!t) return;
    const btn = t.closest && t.closest('.regen-btn');
    if (!btn) return;
    const assistantMsg = t.closest && t.closest('.msg.assistant');
    if (!assistantMsg) return;
    _handleAssistantRegen(ev);
  }, true);
})();
