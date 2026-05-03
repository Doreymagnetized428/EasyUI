/* Feature #019 — إرسال الرسائل */

    const _t019 = (key, fallback, params) => {
      try { return window.t ? window.t(key, fallback, params) : fallback; } catch(e) { return fallback; }
    };

    async function send() {
      // دائماً نستخدم posB كرسالة رئيسية، وnegB كبرومبت سلبي (إذا كان موجود)
      let msg = posB.trim();
      if (window.preprocessPrompt) {
        try { msg = await window.preprocessPrompt(msg, window.userSettings || {}); } catch {}
      }

      const tpl = selectedTemplate || (selectedIndex !== null ? templates[selectedIndex] : null);
      let prefix = '';
      if (tpl && !tpl.is_folder) {
        const cmd = (tpl.command && tpl.command.trim()) || (tpl.label && tpl.label.trim()) || '';
        if (cmd) prefix = cmd + ' ';
      }

      // اسمح بالإرسال إذا كان هناك نص إيجابي أو سلبي أو ملفات أو بادئة
      const hasNegOnly = (negB && negB.trim().length > 0);
      if (!msg && !hasNegOnly && !files.length && !prefix.trim()) return;

      const filesAtSend = files.slice();
      const messageToSend = prefix + msg;
      // إرسال negB فقط إذا كان له محتوى
      const negPromptToSend = negB.trim() ? negB.trim() : null;

      const historyIndex = sendHistory.length;
      sendHistory.push({
        messageSent: messageToSend,
        negPromptSent: negPromptToSend,
        filesSent: filesAtSend.map(f => ({
          data: f.data,
          type: f.type,
          name: f.name,
          size: f.size
        }))
      });

      if (filesAtSend.length) {
        filesAtSend.forEach(file => {
          addBubble({
            type: 'object',
            data: file
          }, 'user', { forceScroll: true });
        });
      }
      const negShown = (negB && negB.trim()) ? (_t019('chat.negative_prefix', '[سلبي] ') + negB.trim()) : '';
      const shownText = msg || negShown || prefix.trim() || messageToSend || _t019('chat.no_text', '(بدون نص)');
      addBubble(shownText, 'user', {historyIndex, forceScroll: true});

      const payload = {
        auto_translate_arabic: (() => {
          const cb = document.getElementById('autoTranslateArabic');
          if (cb) return !!cb.checked;
          const stored = localStorage.getItem('AUTO_TRANSLATE_ARABIC');
          return stored === null ? true : (stored === '1');
        })(),
        message: messageToSend,
        workflow_choice: mode,
        neg_prompt: negPromptToSend,
        image_base64_list: filesAtSend.map(f => f.data),
        username: currentUsername,
        ui_language: (typeof window.getLanguage === 'function' ? window.getLanguage() : (localStorage.getItem('ui_lang') || 'ar')),
        session_id: currentSessionId
      };

      resetUI();

      const waitWrap = addBubble('', 'assistant', { forceScroll: true });
      const bubble = waitWrap.querySelector('.bubble');
      bubble.innerHTML = '<div class="spinner"></div>';
      bubble.classList.add('wait-bubble');

      try {
        if (window.isLMEnabled) {
          if (filesAtSend.length) {
            addBubble(_t019('lm.no_file_support', 'ℹ️ وضع LM لا يدعم إرسال الملفات حالياً. سيتم تجاهل الملفات المرفقة.'), 'assistant');
          }
          // OLLAMA chat عبر الباكند
          try {
            const OLLAMA_MODEL = window.OLLAMA_MODEL || localStorage.getItem('OLLAMA_MODEL') || 'tinyllama:latest';
            window.lmChatHistory = window.lmChatHistory || [];
            const translateArabic = (window.lmTranslateArabic !== undefined)
              ? !!window.lmTranslateArabic
              : (localStorage.getItem('LM_TRANSLATE_ARABIC') === '1');
            
            const chatPayload = {
              username: currentUsername,
              session_id: currentSessionId,
              user_message: messageToSend,
              model: OLLAMA_MODEL,
              chat_history: window.lmChatHistory.slice(-20),
              translate_arabic: translateArabic
            };
            
            const res = await fetch(`${API_BASE}/api/ollama/chat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': currentSessionId
              },
              body: JSON.stringify(chatPayload)
            });
            
            if (!res.ok) {
              waitWrap.remove();
              addBubble(
                _t019('lm.error_with_status_help', `❌ OLLAMA Error ${res.status}:\n\nتأكد من تشغيل OLLAMA:\nollama serve\n\nModel: ${OLLAMA_MODEL}`, { status: res.status, model: OLLAMA_MODEL }),
                'assistant',
                { forceScroll: true }
              );
              return;
            }
            
            const data = await res.json();
            waitWrap.remove();
            
            if (data.status === 'error' || data.error) {
              addBubble(
                _t019('lm.error_details_help', `❌ OLLAMA Error:\n${data.error}\n\nتأكد من تشغيل OLLAMA وأن النموذج متوفر`, { error: data.error }),
                'assistant',
                { forceScroll: true }
              );
              return;
            }
            
            const reply = data.message || _t019('lm.no_valid_reply', '❓ لم أتلقَّ رداً صالحاً من OLLAMA');
            renderAssistant(reply, msg, null, { forceScroll: true });
            
            // تحديث التاريخ المحلي
            window.lmChatHistory.push({ role: 'user', content: messageToSend });
            window.lmChatHistory.push({ role: 'assistant', content: reply });
            
          } catch (err) {
            waitWrap.remove();
            addBubble(
              _t019('errors.connection_with_message', `❌ Connection Error:\n${err.message}\n\nتأكد من الاتصال بالخادم`, { message: err.message }),
              'assistant',
              { forceScroll: true }
            );
          }
        } else {
          // ComfyUI pathway (الافتراضي)
          const res  = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Session-ID': currentSessionId
            },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          waitWrap.remove();

          if (!filesAtSend.length && Array.isArray(data.used_files_data) && data.used_files_data.length) {
            // ignore data:image thumbnails; keep only real upload URLs
            const safe = data.used_files_data.filter(u => typeof u === 'string' && /^\/(uploads)\//.test(u));
            if (safe.length) {
              sendHistory[historyIndex].filesSent = safe.map(u => ({
                data: u,
                type: (u.match(/\.(png|jpe?g|gif|webp)$/i)?'image':(u.match(/\.(mp4|webm|mov)$/i)?'video':(u.match(/\.(mp3|wav|ogg|flac|aac|m4a|opus|weba)$/i)?'audio':'application'))),
                name: 'uploaded_file',
                size: 0
              }));
            }
          }

          if (data.error) {
            addBubble(data.error, 'assistant', { forceScroll: true });
          } else {
            if (Array.isArray(data.used_files_data) && data.used_files_data.length && typeof data.used_files_data[0] === 'string' && data.used_files_data[0].startsWith('data:image/')) {
              renderAssistant(data.used_files_data[0], msg, payload.neg_prompt, { forceScroll: true });
              // Store payload on primary bubble so ⟳ regen works for it as well
              try {
                const pb = chat.lastElementChild && chat.lastElementChild.querySelector('.bubble');
                if (pb && data.used_payload && typeof window._storeBubblePayload === 'function')
                  window._storeBubblePayload(pb, data.used_payload);
              } catch(_){ }
              try {
                const lastMsg = chat.lastElementChild;
                const imgEl = lastMsg ? lastMsg.querySelector('img') : null;
                if (imgEl && data.result) {
                  const finalUrl = data.result;
                  const pre = new Image();
                  pre.decoding = 'async';
                  pre.onload = () => {
                    imgEl.src = finalUrl;
                    // Update chatMedia so lightbox shows the full image, not the thumbnail
                    const mi = imgEl.dataset && imgEl.dataset.idx;
                    if (mi != null && chatMedia[mi]) chatMedia[mi].src = finalUrl;
                  };
                  pre.src = finalUrl;
                }
              } catch (e) {
                renderAssistant(data.result, msg, payload.neg_prompt, { forceScroll: true });
                // if fallback rendered a new primary bubble, attach payload to it too
                try {
                  const pb2 = chat.lastElementChild && chat.lastElementChild.querySelector('.bubble');
                  if (pb2 && data.used_payload && typeof window._storeBubblePayload === 'function')
                    window._storeBubblePayload(pb2, data.used_payload);
                } catch(_){ }
              }
            } else {
              renderAssistant(data.result, msg, payload.neg_prompt, { forceScroll: true });
              // Store payload on primary bubble so ⟳ regen works for it as well
              try {
                const pb = chat.lastElementChild && chat.lastElementChild.querySelector('.bubble');
                if (pb && data.used_payload && typeof window._storeBubblePayload === 'function')
                  window._storeBubblePayload(pb, data.used_payload);
              } catch(_){ }
            }
            // ✨ Multi-result: render extra results from multi-output workflows
            if (Array.isArray(data.extra_results)) {
              for (const extra of data.extra_results) {
                if (!extra) continue;
                renderAssistant(extra, msg, payload.neg_prompt, { forceScroll: true });
                // Store payload on the extra bubble so ⟳ regen works
                try {
                  const eb = chat.lastElementChild && chat.lastElementChild.querySelector('.bubble');
                  if (eb && data.used_payload && typeof window._storeBubblePayload === 'function')
                    window._storeBubblePayload(eb, data.used_payload);
                } catch(_){}
              }
            }
          }
        }
      } catch (e) {
        waitWrap.remove();
        addBubble(_t019('errors.cannot_connect_server', '❌ تعذر الاتصال بالخادم.'), 'assistant', { forceScroll: true });
      }
    }

