/* Feature #020 — إرسال معدل من مودال التعديل */

/* ===================== Helpers ===================== */

// أصل الـ API
function _getApiOrigin() {
  try { return new URL(API_BASE, window.location.href).origin; }
  catch { return window.location.origin; }
}

// تحويل /uploads -> /media (حسب اللوج، السيرفر يخدم على /media) - تعطيل للتوافق مع مسارات المستخدم
function _fixMediaPath(s) {
  if (typeof s !== 'string') return s;
  // لا نُحوّل المسارات الآن - كل مسار يبقى كما هو
  // المسارات الجديدة: /user-uploads/{username}/ و /user-media/{username}/
  return s;
}

// (اختياري) تحويل لمسار مطلق على أصل الـ API
function _toAbsoluteOnApi(s) {
  try {
    if (typeof s === 'string' && s.startsWith('/')) {
      return new URL(s, _getApiOrigin()).href;
    }
  } catch {}
  return s;
}

// تصنيف وسائط للعرض
function _looksImage(src, type) {
  const t = (type || '').toLowerCase();
  if (t.startsWith('image')) return true;
  if (typeof src !== 'string') return false;
  return src.startsWith('data:image')
      || /\.(png|jpe?g|gif|webp)$/i.test(src)
      || /^https?:\/\//i.test(src)
      || /^\/(media|uploads)\//i.test(src);
}
function _looksVideo(src, type) {
  const t = (type || '').toLowerCase();
  if (t.startsWith('video')) return true;
  if (typeof src !== 'string') return false;
  return /\.(mp4|webm|mov|m4v)$/i.test(src);
}
function _looksAudio(src, type) {
  const t = (type || '').toLowerCase();
  if (t.startsWith('audio')) return true;
  if (typeof src !== 'string') return false;
  return /\.(mp3|wav|ogg|m4a)$/i.test(src);
}

// جلب صورة (رابط) كـ Data URL
async function _urlImageToDataURL(url) {
  const fixed = _fixMediaPath(url);
  const abs = _toAbsoluteOnApi(fixed);
  const res = await fetch(abs, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`fetch-failed ${res.status}`);
  const blob = await res.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  return dataUrl;
}

// جمع صور الرسالة (كما ستُعرض) إلى Data URL بنفس الترتيب
async function _collectImageDataURLs(files) {
  const out = [];
  for (const f of files) {
    const src = f?.data || '';
    const t   = (f?.type || '').toLowerCase();
    if (!_looksImage(src, t)) continue;

    if (typeof src === 'string' && src.startsWith('data:image')) {
      out.push(src);
      continue;
    }
    if (typeof src === 'string' && (/^\/(media|uploads)\//i.test(src) || /^https?:\/\//i.test(src))) {
      try {
        const dataUrl = await _urlImageToDataURL(src);
        out.push(dataUrl);
      } catch {
        // تجاهل التي فشل تحويلها
      }
    }
  }
  return out;
}

// fallback من التاريخ للخلف (من sendHistory)
function _fallbackPreviousImagesFromHistory(currentIndex) {
  if (!Array.isArray(sendHistory) || !sendHistory.length) return [];
  for (let i = currentIndex - 1; i >= 0; i--) {
    const rec = sendHistory[i];
    if (rec && Array.isArray(rec.filesSent) && rec.filesSent.length) {
      return rec.filesSent.map(f => ({
        data: f.data, type: f.type, name: f.name, size: f.size
      }));
    }
  }
  return [];
}

// اعثر على عقدة رسالة المستخدم الموافقة لفهرس sendHistory (بناءً على ترتيب أزرار ✎ في DOM)
function _findUserMsgNodeByHistoryIndex(index) {
  try {
    const btns = document.querySelectorAll('.msg.user .bubble .user-edit-btn');
    const btn = btns[index];
    if (btn) {
      const msgNode = btn.closest('.msg');
      if (msgNode) return msgNode;
    }
  } catch {}
  return null;
}

// من عقدة رسالة معيّنة، ارجع للخلف حتى تجد الرسالة السابقة التي تحتوي صورًا، وخذ صور "تلك الرسالة فقط"
function _fallbackPreviousImagesFromDOMByMessageIndex(currentIndex, limit = Infinity) {
  const results = [];
  try {
    const curMsg = _findUserMsgNodeByHistoryIndex(currentIndex);
    if (!curMsg) return results;
    // We'll walk backwards, but prefer images belonging to the nearest '.msg' node
    // (typically '.msg.assistant'). We only fall back to raw <img> siblings if no
    // intervening message node with images exists.
    const bufferedRawImgs = []; // collect contiguous raw <img> siblings directly preceding curMsg
    let node = curMsg.previousElementSibling;
    while (node) {
      // If this is a message wrapper (normal expected structure)
      if (node.classList && node.classList.contains('msg')) {
        // Prefer images inside .bubble first
        try {
          const bubbleImgs = node.querySelectorAll('.bubble img');
          if (bubbleImgs && bubbleImgs.length) {
            for (let i = 0; i < bubbleImgs.length && results.length < limit; i++) {
              const src = bubbleImgs[i].getAttribute('src');
              if (src) results.push({ data: src, type: 'image', name: 'prev_msg_image', size: 0 });
            }
            break; // nearest message containing images found
          }
        } catch(_){}

        // If no .bubble images, look for any <img> descendants inside this .msg
        try {
          const anyImgs = node.querySelectorAll('img');
          if (anyImgs && anyImgs.length) {
            for (let i = 0; i < anyImgs.length && results.length < limit; i++) {
              const src = anyImgs[i].getAttribute('src');
              if (src) results.push({ data: src, type: 'image', name: 'prev_msg_image', size: 0 });
            }
            break;
          }
        } catch(_){}

        // This .msg had no images — stop here, do not look further back because
        // we only consider the nearest previous message for 'previous image'.
        break;
      }

      // If it's not a .msg node, but it's an IMG, buffer it as a potential fallback.
      if (node.tagName && node.tagName.toUpperCase() === 'IMG') {
        try { const s = node.getAttribute('src'); if (s) bufferedRawImgs.push(s); } catch(_){}
        // continue walking to see if a .msg with images appears earlier; we only
        // use buffered raw imgs if no .msg with images is found before we stop.
        node = node.previousElementSibling; continue;
      }

      // For other non-.msg nodes, check if they contain images and buffer them
      // (but still prefer images inside a nearest .msg if present)
      try {
        if (node.querySelectorAll) {
          const imgsAny = node.querySelectorAll('img');
          if (imgsAny && imgsAny.length) {
            for (let i = 0; i < imgsAny.length && bufferedRawImgs.length < limit; i++) {
              try { const s = imgsAny[i].getAttribute('src'); if (s) bufferedRawImgs.push(s); } catch(_){}
            }
          }
        }
      } catch(_){}

      node = node.previousElementSibling;
    }

    // If we didn't find images inside a nearest .msg, but we buffered raw imgs, use them
    if (results.length === 0 && bufferedRawImgs.length) {
      // bufferedRawImgs is collected nearest-first (closest to curMsg first) —
      // reverse to keep visual order: older -> newer
      for (let i = bufferedRawImgs.length - 1; i >= 0 && results.length < limit; i--) {
        results.push({ data: bufferedRawImgs[i], type: 'image', name: 'prev_msg_image', size: 0 });
      }
    }
  } catch {}
  return results;
}

/**
 * التحقق الذكي: جهّز الملفات للعرض والإرسال + حدّد مصدرها
 * يعيد كائنًا: { files, source }
 * source: 'explicit' | 'history-fallback' | 'dom-fallback' | 'none'
 */
function _prepareFilesWithSource(rawFiles, currentIndex, includeFiles) {
  let files = [];
  let source = 'none';

  if (includeFiles) {
    // أولاً: حاول من DOM (الفقاعات السابقة في السيشن)
    files = _fallbackPreviousImagesFromDOMByMessageIndex(currentIndex, Infinity);
    if (files.length) {
      source = 'dom-fallback';
    } else {
      // ثانياً: حاول من التاريخ
      files = _fallbackPreviousImagesFromHistory(currentIndex);
      if (files.length) {
        source = 'history-fallback';
      } else if (Array.isArray(rawFiles) && rawFiles.length) {
        // أخيراً: استخدم الملفات المخزنة
        files = rawFiles.map(f => ({ data: f.data, type: f.type, name: f.name, size: f.size }));
        source = 'explicit';
      }
    }
  }

  // تصحيح المسارات
  files.forEach(f => {
    if (typeof f.data === 'string') {
      f.data = _fixMediaPath(f.data);
      // f.data = _toAbsoluteOnApi(f.data); // عند الحاجة
    }
  });

  // إبقاء صور/فيديو/صوت فقط
  files = files.filter(f => {
    const d = f.data || '';
    const t = f.type || '';
    return _looksImage(d, t) || _looksVideo(d, t) || _looksAudio(d, t);
  });

  return { files, source };
}

/* ===================== Main handler ===================== */

const _t020 = (key, fallback, params) => {
  try { return window.t ? window.t(key, fallback, params) : fallback; } catch(e) { return fallback; }
};

editMsgSend.onclick = async () => {
  if (editMsgCurrentIndex == null) return;
  const rec = sendHistory[editMsgCurrentIndex];
  if (!rec) return;

  const newMsg = editMsgInput.value.trim();
  const includeFiles = editMsgIncludeImgs.checked;

  // جهّز الصور + المصدر
  const prep = _prepareFilesWithSource(rec.filesSent, editMsgCurrentIndex, includeFiles);
  const filesToSend = prep.files;
  const filesSource = prep.source;

  // سجّل الرسالة المعدلة في التاريخ:
  // ❗ لا نخزّن نتائج الفولباك داخل sendHistory لتجنب "الالتصاق/التكرار" لاحقًا
  const newIndex = sendHistory.length;
  sendHistory.push({
    messageSent: newMsg,
    negPromptSent: rec.negPromptSent || null,
    filesSent: (filesSource === 'explicit') ? filesToSend : [],
    filesSource
  });

  // اعرض وسائط المستخدم (مرّة واحدة فقط الآن)
  if (filesToSend.length) {
    filesToSend.forEach(file => {
      const src = file.data || '';
      const t   = file.type || '';

      if (_looksImage(src, t)) {
        addBubble({ type: 'object', data: { type: 'image', data: src } }, 'user');
      } else if (_looksVideo(src, t)) {
        addBubble({ type: 'object', data: { type: 'video', data: src } }, 'user');
      } else if (_looksAudio(src, t)) {
        addBubble({ type: 'object', data: { type: 'audio', data: src } }, 'user');
      }
    });
  } else if (includeFiles) {
    addBubble(_t020('chat.no_valid_images_for_message', '⚠️ لا توجد صور صالحة مرتبطة بهذه الرسالة أو الرسالة السابقة لها.'), 'assistant');
  }

  // فقاعة نص المستخدم
  addBubble(newMsg || _t020('chat.no_text', '(بدون نص)'), 'user', { historyIndex: newIndex });

  // أغلق المودال
  closeEditMsgModal();

  // فقاعة انتظار
  const waitWrap = addBubble('', 'assistant');
  const bubble = waitWrap.querySelector('.bubble');
  bubble.innerHTML = '<div class="spinner"></div>';
  bubble.classList.add('wait-bubble');

  try {
    // أرسل نفس الصور المعروضة كـ Data URL
    const imageDataURLs = await _collectImageDataURLs(filesToSend);

    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': currentSessionId
      },
      body: JSON.stringify({
        message: newMsg,
        workflow_choice: mode,
        neg_prompt: rec.negPromptSent || null,
        image_base64_list: imageDataURLs,
        username: currentUsername,
        session_id: currentSessionId
      })
    });

    const data = await res.json();
    try { waitWrap.remove(); } catch {}

    // ✅ لا نعرض used_files_data داخل فقاعات "المستخدم"
    // فقط نخزنها كي تكون explicit للرسالة الجديدة (لا يسبب تكرار)
    if (Array.isArray(data.used_files_data) && data.used_files_data.length) {
      sendHistory[newIndex].filesSent = data.used_files_data.map(u => {
        let d = typeof u === 'string' ? _fixMediaPath(u) : u;
        return {
          data: d,
          type: (
            typeof d === 'string' && d.startsWith('data:image') ? 'image' :
            /\.png|\.jpe?g|\.gif|\.webp$/i.test(d) ? 'image' :
            /\.mp4|\.webm|\.mov|\.m4v$/i.test(d) ? 'video' :
            /\.mp3|\.wav|\.ogg|\.m4a$/i.test(d) ? 'audio' : 'application'
          ),
          name: 'uploaded_file',
          size: 0
        };
      });
      sendHistory[newIndex].filesSource = 'explicit';
      // ❌ لا addBubble هنا للمستخدم — تجنّب التكرار
    }

    // عرض رد المساعد فقط (الصورة الناتجة تظهر هنا)
    if (data.error) {
      addBubble(data.error, 'assistant');
    } else {
      renderAssistant(data.result, newMsg, rec.negPromptSent);
    }

  } catch (e) {
    try { waitWrap.remove(); } catch {}
    addBubble(_t020('errors.cannot_connect_server', '❌ تعذر الاتصال بالخادم.'), 'assistant');
  }
};
