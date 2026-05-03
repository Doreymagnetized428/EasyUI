/* Feature #021 — إعادة إرسال (زر المستخدم)
   الهدف:
   - الحفاظ على الدالة الأصلية resendUser كما كانت (تستخدم نفس الملفات إن وُجدت).
   - إضافة دالة مستقلة resendUserNoFiles لزر "إعادة الإرسال" في فقاعة المستخدم ترسل النص فقط بدون أي ملفات.
   - بهذه الطريقة، القلم ✎ يبقى كما هو تمامًا (لا يتأثر)،
     وزر ⟳ المستخدم يستخدم الدالة الجديدة التي لا تستفيد من "أرسل مع نفس الملفات".
*/

/* === الدالة الأصلية: لا تمسها إن كان القلم يعتمد عليها === */
const _t021 = (key, fallback, params) => {
  try { return window.t ? window.t(key, fallback, params) : fallback; } catch(e) { return fallback; }
};

async function resendUser(historyIndex) {
  const rec = sendHistory[historyIndex];
  if (!rec) return;

  const messageToSend   = rec.messageSent || '';
  const negPromptToSend = rec.negPromptSent || null;

  // ===== تطبيع ملفات الإرسال: نضمن أن f.data يكون سلسلة (data URL أو رابط) =====
  async function _toDataString(d) {
    if (typeof d === 'string') {
      // إذا كان URL (يبدأ بـ / أو http) نحوله إلى data URL
      if (d.startsWith('/') || d.startsWith('http')) {
        try {
          const response = await fetch(d, { credentials: 'same-origin' });
          if (response.ok) {
            const blob = await response.blob();
            return await new Promise((res, rej) => {
              const fr = new FileReader();
              fr.onload = () => res(fr.result);
              fr.onerror = () => rej(new Error('Failed to read blob'));
              fr.readAsDataURL(blob);
            });
          }
        } catch (e) {
          console.warn('[resendUser] Failed to fetch URL:', d, e);
        }
      }
      return d;
    }
    if (d instanceof Blob || (typeof File !== 'undefined' && d instanceof File)) {
      return await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = () => rej(new Error('Failed to read blob'));
        fr.readAsDataURL(d);
      });
    }
    // لو كان كائن يحتوي مسار
    if (d && d.url) return await _toDataString(d.url);
    if (d && d.path) return await _toDataString(d.path);
    return '';
  }

  const rawFiles = rec.filesSent || [];
  const filesToSend = await Promise.all(rawFiles.map(async f => {
    // التعامل مع الملفات المستعادة من الجلسة (تحتوي url فقط)
    const dataSource = f.data || f.url || f;
    return {
      data: await _toDataString(dataSource),
      type: f.type || 'image',
      name: f.name || 'uploaded_file',
      size: f.size || 0
    };
  }));

  // تصفية الملفات الفارغة
  const validFiles = filesToSend.filter(f => f.data && f.data.startsWith('data:'));

  // لوق تشخيصي سريع
  console.log('[resendUser] validFiles preview:', validFiles.map(f => f.data ? f.data.slice(0,100) : '[empty]'));

  // سجل الرسالة الجديدة (يحافظ على الملفات كما كانت)
  const newIndex = sendHistory.length;
  sendHistory.push({
    messageSent: messageToSend,
    negPromptSent: negPromptToSend,
    filesSent: validFiles
  });

  // عرض وسائط المستخدم إن وُجدت
  if (validFiles.length) {
    validFiles.forEach(file => {
      addBubble(file.data, 'user', { forceScroll: true });
    });
  }
  // فقاعة نص المستخدم
  addBubble(messageToSend || _t021('chat.no_text', '(بدون نص)'), 'user', { historyIndex: newIndex, forceScroll: true });

  // فقاعة انتظار
  const waitWrap = addBubble('', 'assistant', { forceScroll: true });
  const bubble = waitWrap.querySelector('.bubble');
  bubble.innerHTML = '<div class="spinner"></div>';
  bubble.classList.add('wait-bubble');

  try {
    const res  = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': currentSessionId
      },
      body: JSON.stringify({
        message: messageToSend,
        workflow_choice: mode,
        neg_prompt: negPromptToSend,
        image_base64_list: validFiles.map(f => f.data),
        username: currentUsername,
        session_id: currentSessionId
      })
    });

    const data = await res.json();
    waitWrap.remove();

    // نفس سلوكك السابق: لو السيرفر أعاد used_files_data وتحديدًا لم تكن هناك ملفات مُرسلة
    if (!validFiles.length && Array.isArray(data.used_files_data) && data.used_files_data.length) {
      sendHistory[newIndex].filesSent = data.used_files_data.map(dataUrl => ({
        data: dataUrl,
        type: (
          dataUrl.startsWith('data:')
            ? dataUrl.split(':')[1].split(';')[0]
            : (/\.(png|jpe?g|gif|webp)$/i.test(dataUrl) ? 'image'
              : /\.(mp4|webm|mov)$/i.test(dataUrl) ? 'video'
              : /\.(mp3|wav|ogg)$/i.test(dataUrl) ? 'audio'
              : 'application')
        ),
        name: 'uploaded_file',
        size: 0
      }));
    }

    if (data.error) {
      addBubble(data.error, 'assistant', { forceScroll: true });
    } else {
      renderAssistant(data.result, messageToSend, negPromptToSend, { forceScroll: true });
      // Store payload on primary bubble so ⟳ regen works for it as well
      try {
        const pb = chat.lastElementChild && chat.lastElementChild.querySelector('.bubble');
        if (pb && data.used_payload && typeof window._storeBubblePayload === 'function')
          window._storeBubblePayload(pb, data.used_payload);
      } catch(_){ }
      // ✨ Multi-result: render extra results
      if (Array.isArray(data.extra_results)) {
        for (const extra of data.extra_results) {
          if (!extra) continue;
          renderAssistant(extra, messageToSend, negPromptToSend, { forceScroll: true });
          try {
            const eb = chat.lastElementChild && chat.lastElementChild.querySelector('.bubble');
            if (eb && data.used_payload && typeof window._storeBubblePayload === 'function')
              window._storeBubblePayload(eb, data.used_payload);
          } catch(_){}
        }
      }
    }
  } catch {
    try { waitWrap.remove(); } catch {}
    addBubble(_t021('errors.cannot_connect_server', '❌ تعذر الاتصال بالخادم.'), 'assistant');
  }
}

/* === الدالة الجديدة لزر ⟳ داخل فقاعة المستخدم: بلا ملفات نهائيًا === */
async function resendUserNoFiles(historyIndex) {
  const rec = sendHistory[historyIndex];
  if (!rec) return;

  const messageToSend   = rec.messageSent || '';
  const negPromptToSend = rec.negPromptSent || null;

  // دائمًا بلا ملفات
  const filesToSend = [];

  // سجل الرسالة الجديدة بدون ملفات
  const newIndex = sendHistory.length;
  sendHistory.push({
    messageSent: messageToSend,
    negPromptSent: negPromptToSend,
    filesSent: []      // ← تأكيدًا: لا نخزن أي ملفات
  });

  // لا نعرض أي وسائط في فقاعة المستخدم
  addBubble(messageToSend || _t021('chat.no_text', '(بدون نص)'), 'user', { historyIndex: newIndex, forceScroll: true });

  // فقاعة انتظار
  const waitWrap = addBubble('', 'assistant', { forceScroll: true });
  const bubble = waitWrap.querySelector('.bubble');
  bubble.innerHTML = '<div class="spinner"></div>';
  bubble.classList.add('wait-bubble');

  try {
    const res  = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': currentSessionId
      },
      body: JSON.stringify({
        message: messageToSend,
        workflow_choice: mode,
        neg_prompt: negPromptToSend,
        image_base64_list: [],                  // ← فارغة دائمًا
        username: currentUsername,
        session_id: currentSessionId
      })
    });

    const data = await res.json();
    try { waitWrap.remove(); } catch {}

    // في وضع "بدون ملفات" نتجاهل أي used_files_data حتى لا نُعيد ملء السجل بالصور
    if (data.error) {
      addBubble(data.error, 'assistant', { forceScroll: true });
    } else {
      renderAssistant(data.result, messageToSend, negPromptToSend, { forceScroll: true });
      // Store payload on primary bubble so ⟳ regen works for it as well
      try {
        const pb = chat.lastElementChild && chat.lastElementChild.querySelector('.bubble');
        if (pb && data.used_payload && typeof window._storeBubblePayload === 'function')
          window._storeBubblePayload(pb, data.used_payload);
      } catch(_){ }
      // ✨ Multi-result: render extra results
      if (Array.isArray(data.extra_results)) {
        for (const extra of data.extra_results) {
          if (!extra) continue;
          renderAssistant(extra, messageToSend, negPromptToSend, { forceScroll: true });
          try {
            const eb = chat.lastElementChild && chat.lastElementChild.querySelector('.bubble');
            if (eb && data.used_payload && typeof window._storeBubblePayload === 'function')
              window._storeBubblePayload(eb, data.used_payload);
          } catch(_){}
        }
      }
    }
  } catch {
    try { waitWrap.remove(); } catch {}
    addBubble(_t021('errors.cannot_connect_server', '❌ تعذر الاتصال بالخادم.'), 'assistant');
  }
}
