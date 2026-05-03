/* Feature #016 — فقاعات الدردشة */

    const _t016 = (key, fallback, params) => {
      try { return window.t ? window.t(key, fallback, params) : fallback; } catch(e) { return fallback; }
    };

    async function _toDataUrlForSend(src) {
      if (!src) return '';
      if (typeof src !== 'string') src = String(src || '');
      if (!src) return '';
      if (src.startsWith('data:')) return src;
      try {
        const res = await fetch(src, { credentials: 'same-origin', cache: 'force-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = () => reject(new Error('Failed to read blob'));
          fr.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn('[sendToBar] cannot convert image URL to data URL:', src, e);
        return '';
      }
    }

    async function _pushAudioToBar(audioSrc, fileName) {
      if (typeof files === 'undefined') return;
      const dataUrl = await _toDataUrlForSend(audioSrc);
      if (!dataUrl || !String(dataUrl).startsWith('data:')) {
        alert(_t016('errors.audio_send_to_bar_failed', 'تعذر إرسال الصوت إلى البار. حاول مرة أخرى.'));
        return;
      }
      files.push({
        name: fileName || 'audio.mp3',
        type: 'audio',
        size: dataUrl.length,
        data: dataUrl
      });
      if (typeof renderFilePreviews === 'function') renderFilePreviews();
      if (typeof updateSend === 'function') updateSend();
    }

    async function _pushImageToBar(imgSrc, fileName) {
      if (typeof files === 'undefined') return;
      const dataUrl = await _toDataUrlForSend(imgSrc);
      if (!dataUrl || !String(dataUrl).startsWith('data:')) {
        alert(_t016('errors.image_send_to_bar_failed', 'تعذر إرسال الصورة إلى البار. حاول مرة أخرى.'));
        return;
      }
      files.push({
        name: fileName || 'chat_image.png',
        type: 'image',
        size: dataUrl.length,
        data: dataUrl
      });
      if (typeof renderFilePreviews === 'function') renderFilePreviews();
      if (typeof updateSend === 'function') updateSend();
    }

    function _isChatNearBottom(el, threshold = 120) {
      if (!el) return true;
      return (el.scrollHeight - el.scrollTop - el.clientHeight) <= threshold;
    }

    function _scrollChatToBottom(shouldScroll) {
      if (!shouldScroll || !chat) return;
      chat.scrollTop = chat.scrollHeight;
      _updateJumpToBottomVisibility();
    }

    function _scrollChatToBottomIfStillNearBottom(shouldScroll, threshold = 120) {
      if (!shouldScroll || !chat) return;
      if (!_isChatNearBottom(chat, threshold)) return;
      chat.scrollTop = chat.scrollHeight;
      _updateJumpToBottomVisibility();
    }

    function _getJumpToBottomBtn() {
      if (window.__jumpToBottomBtn && document.body.contains(window.__jumpToBottomBtn)) {
        return window.__jumpToBottomBtn;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'jump-to-bottom-btn';
      btn.title = _t016('chat.jump_to_latest', 'الانتقال لآخر الرسائل');
      btn.textContent = '↓';
      btn.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:96px;width:42px;height:42px;border:none;border-radius:50%;background:rgba(117,117,117,.62);color:#fff;font-size:20px;font-weight:700;display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 18px rgba(0,0,0,.16);backdrop-filter:blur(2px);z-index:1200;opacity:.9;';
      btn.onmouseover = () => { btn.style.filter = 'brightness(1.15)'; };
      btn.onmouseout = () => { btn.style.filter = 'none'; };
      btn.onclick = () => {
        if (!chat) return;
        chat.scrollTop = chat.scrollHeight;
        _updateJumpToBottomVisibility();
      };
      document.body.appendChild(btn);
      window.__jumpToBottomBtn = btn;
      return btn;
    }

    function _hideJumpToBottomBtn() {
      const btn = window.__jumpToBottomBtn;
      if (!btn) return;
      btn.style.display = 'none';
    }

    function _scheduleHideJumpToBottomBtn() {
      if (window.__jumpToBottomHideTimer) {
        clearTimeout(window.__jumpToBottomHideTimer);
      }
      window.__jumpToBottomHideTimer = setTimeout(() => {
        _hideJumpToBottomBtn();
      }, 1700);
    }

    function _updateJumpToBottomVisibility(showTemporarily) {
      if (!chat) return;
      const btn = _getJumpToBottomBtn();
      const show = !_isChatNearBottom(chat, 180);
      if (!show) {
        if (window.__jumpToBottomHideTimer) clearTimeout(window.__jumpToBottomHideTimer);
        btn.style.display = 'none';
        return;
      }
      if (showTemporarily) {
        btn.style.display = 'flex';
        _scheduleHideJumpToBottomBtn();
      }
    }

    function addBubble(content, who = 'user', opts={}) {
      const shouldForceScroll = !!opts.forceScroll;
      const shouldStickToBottom = shouldForceScroll || _isChatNearBottom(chat);
      const wrap = document.createElement('div');
      wrap.className = `msg ${who}`;
      const bub = document.createElement('div');
      bub.className = 'bubble';

      if (who === 'user' && opts.historyIndex != null && typeof content === 'string' && content.trim() !== '') {
        const ubtn = document.createElement('button');
        ubtn.className = 'user-regen-btn';
        ubtn.title = _t016('chat.resend', 'إعادة إرسال');
        ubtn.textContent = '⟳';
        ubtn.onclick = (ev) => {
          ev.stopPropagation();
          resendUserNoFiles(opts.historyIndex);
        };
        bub.appendChild(ubtn);

        const ebtn = document.createElement('button');
        ebtn.className = 'user-edit-btn';
        ebtn.title = _t016('chat.edit_resend', 'تعديل وإعادة إرسال');
        ebtn.textContent = '✎';
        ebtn.onclick = (ev) => {
          ev.stopPropagation();
          openEditMsgModal(opts.historyIndex);
        };
        bub.appendChild(ebtn);
      }

      if (typeof content === 'string') {
        const imgRe = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/;
        const videoRe = /data:video\/[^;]+;base64,[A-Za-z0-9+/=]+/;
        const audioRe = /data:audio\/[^;]+;base64,[A-Za-z0-9+/=]+/;
        
        if (imgRe.test(content)) {
          const img = new Image();
          img.src = content.match(imgRe)[0];
          img.dataset.idx = chatMedia.length;
          img.onload = () => {
            if (shouldForceScroll) _scrollChatToBottom(true);
            else _scrollChatToBottomIfStillNearBottom(shouldStickToBottom);
          };
          img.onclick = () => openLightbox(+img.dataset.idx);
          bub.appendChild(img);
          chatMedia.push({type: 'image', src: img.src});
          
          // زر إرسال الصورة للبار (للصور في فقاعات المستخدم)
          if (who === 'user') {
            bub.style.position = 'relative';
            const sendBtn = document.createElement('button');
            sendBtn.textContent = '↩';
            sendBtn.title = _t016('chat.send_to_bar', 'إرسال للبار');
            sendBtn.style.cssText = 'position:absolute;top:8px;right:8px;width:32px;height:32px;border:none;border-radius:50%;background:#4caf50cc;color:#fff;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 6px #4caf50aa;transform:scaleX(-1);';
            sendBtn.onmouseover = () => sendBtn.style.background = '#43a047';
            sendBtn.onmouseout = () => sendBtn.style.background = '#4caf50cc';
            sendBtn.onclick = async (e) => {
              e.stopPropagation();
              await _pushImageToBar(img.src, 'chat_image.png');
            };
            bub.appendChild(sendBtn);
          }
        } else if (videoRe.test(content)) {
          const video = document.createElement('video');
          video.src = content.match(videoRe)[0];
          video.controls = true;
          video.style.maxWidth = '100%';
          video.style.maxHeight = '300px';
          bub.appendChild(video);
          chatMedia.push({type: 'video', src: video.src});
        } else if (audioRe.test(content)) {
          const audio = document.createElement('audio');
          audio.src = content.match(audioRe)[0];
          audio.controls = true;
          bub.appendChild(audio);
          chatMedia.push({type: 'audio', src: audio.src});
        } else {
          bub.appendChild(document.createTextNode(content));
          if (who === 'user') {
            bub.style.cursor = 'pointer';
            bub.onclick = () => {
              neg = false;
              posB = content;
              // إن وجد تاريخ للإرسال، اجلب البرومت السلبي المرتبط
              try {
                if (opts && opts.historyIndex != null && Array.isArray(window.sendHistory)) {
                  const rec = window.sendHistory[opts.historyIndex];
                  if (rec && typeof rec.negPromptSent === 'string' && rec.negPromptSent.trim()) {
                    negB = rec.negPromptSent;
                  }
                }
              } catch {}
              mainInput.value = content;
              mainInput.placeholder = _t016('composer.type_here', 'اكتب هنا …');
              // أطلق أحداث لإعلام النظام بالتحديث
              try { mainInput.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
              try { mainInput.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
              updateSend();
            };
          }
        }
      } else if (content.type === 'object' && content.data) {
        if (content.data.type === 'image') {
          const img = new Image();
          img.src = content.data.data;
          img.dataset.idx = chatMedia.length;
          img.onload = () => {
            if (shouldForceScroll) _scrollChatToBottom(true);
            else _scrollChatToBottomIfStillNearBottom(shouldStickToBottom);
          };
          img.onclick = () => openLightbox(+img.dataset.idx);
          bub.appendChild(img);
          chatMedia.push({type: 'image', src: img.src});
          
          // زر إرسال الصورة للبار
          if (who === 'user') {
            bub.style.position = 'relative';
            const sendBtn = document.createElement('button');
            sendBtn.textContent = '↩';
            sendBtn.title = _t016('chat.send_to_bar', 'إرسال للبار');
            sendBtn.style.cssText = 'position:absolute;top:8px;right:8px;width:32px;height:32px;border:none;border-radius:50%;background:#4caf50cc;color:#fff;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 6px #4caf50aa;transform:scaleX(-1);';
            sendBtn.onmouseover = () => sendBtn.style.background = '#43a047';
            sendBtn.onmouseout = () => sendBtn.style.background = '#4caf50cc';
            sendBtn.onclick = async (e) => {
              e.stopPropagation();
              await _pushImageToBar(img.src, 'chat_image.png');
            };
            bub.appendChild(sendBtn);
          }
        } else if (content.data.type === 'video') {
          const video = document.createElement('video');
          video.src = content.data.data;
          video.controls = true;
          video.style.maxWidth = '100%';
          video.style.maxHeight = '300px';
          bub.appendChild(video);
          chatMedia.push({type: 'video', src: video.src});
        } else if (content.data.type === 'audio') {
          const audio = document.createElement('audio');
          audio.src = content.data.data;
          audio.controls = true;
          audio.style.width = '100%';
          bub.appendChild(audio);
          chatMedia.push({type: 'audio', src: audio.src});

          // زر إرسال الصوت للبار
          if (who === 'user') {
            bub.style.position = 'relative';
            const sendAudioBtn = document.createElement('button');
            sendAudioBtn.textContent = '↩';
            sendAudioBtn.title = _t016('chat.send_to_bar', 'إرسال للبار');
            sendAudioBtn.style.cssText = 'position:absolute;top:8px;right:8px;width:32px;height:32px;border:none;border-radius:50%;background:#4caf50cc;color:#fff;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 6px #4caf50aa;transform:scaleX(-1);';
            sendAudioBtn.onmouseover = () => sendAudioBtn.style.background = '#43a047';
            sendAudioBtn.onmouseout = () => sendAudioBtn.style.background = '#4caf50cc';
            sendAudioBtn.onclick = async (e) => {
              e.stopPropagation();
              const name = (content.data.name) || 'audio.mp3';
              await _pushAudioToBar(audio.src, name);
            };
            bub.appendChild(sendAudioBtn);
          }
        }
      }

      wrap.appendChild(bub);
      chat.appendChild(wrap);
      _scrollChatToBottom(shouldStickToBottom);
      return wrap;
    }

    function renderAssistant(content, msg, negP, opts) {
      opts = opts || {};
      const shouldForceScroll = !!opts.forceScroll;
      const shouldStickToBottom = shouldForceScroll || _isChatNearBottom(chat);
      const wrap = document.createElement('div');
      wrap.className = 'msg assistant';
      const bub = document.createElement('div');
      bub.className = 'bubble';
  
      const isUrl = /^(https?:|\/(media|uploads)\/)/.test(content);
      const isImage = content.startsWith('data:image/') || (isUrl && /\.(png|jpe?g|gif|webp)$/i.test(content));
      const isVideo = content.startsWith('data:video/') || (isUrl && /\.(mp4|webm|mov)$/i.test(content));
      const isAudio = content.startsWith('data:audio/') || (isUrl && /\.(mp3|wav|ogg|flac|aac|m4a|opus|weba)$/i.test(content));
  
      if (isImage) {
          const img = new Image();
          img.loading = 'lazy';
          img.src = content;
          img.dataset.idx = chatMedia.length;
          img.onload = () => {
            if (shouldForceScroll) _scrollChatToBottom(true);
            else _scrollChatToBottomIfStillNearBottom(shouldStickToBottom);
          };
          img.onclick = () => openLightbox(+img.dataset.idx);
          bub.appendChild(img);
          chatMedia.push({type: 'image', src: img.src});
  
          const btn = document.createElement('button');
          btn.className = 'regen-btn';
          btn.textContent = '⟳';
          btn.title = _t016('chat.regen', 'إعادة توليد');
          btn.onclick = () => regen(msg, negP);
          bub.appendChild(btn);
          
          // زر فتح محرر الماسك للصورة
          const maskBtn = document.createElement('button');
          maskBtn.textContent = '🎨';
          maskBtn.title = _t016('chat.open_mask_editor', 'فتح محرر الأقنعة');
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
          maskBtn.onmouseover = () => maskBtn.style.background = '#fb8c00';
          maskBtn.onmouseout = () => maskBtn.style.background = '#ff9800cc';
          maskBtn.onclick = () => {
            // إضافة الصورة للـ files array مؤقتاً
            if (typeof files !== 'undefined') {
              files.push({
                name: 'assistant_image.png',
                type: 'image',
                size: img.src.length,
                data: img.src
              });
              renderFilePreviews();
              // فتح محرر الماسك
              if (window.openMaskEditor) {
                window.openMaskEditor(files.length - 1);
              }
            }
          };
          bub.appendChild(maskBtn);
          
          // زر إرسال الصورة للبار
          const sendToBarBtn = document.createElement('button');
          sendToBarBtn.textContent = '↩';
          sendToBarBtn.title = _t016('chat.send_to_bar', 'إرسال للبار');
          sendToBarBtn.style.position = 'absolute';
          sendToBarBtn.style.top = '8px';
          sendToBarBtn.style.right = '88px';
          sendToBarBtn.style.width = '32px';
          sendToBarBtn.style.height = '32px';
          sendToBarBtn.style.border = 'none';
          sendToBarBtn.style.borderRadius = '50%';
          sendToBarBtn.style.background = '#4caf50cc';
          sendToBarBtn.style.color = '#fff';
          sendToBarBtn.style.fontSize = '18px';
          sendToBarBtn.style.display = 'flex';
          sendToBarBtn.style.alignItems = 'center';
          sendToBarBtn.style.justifyContent = 'center';
          sendToBarBtn.style.cursor = 'pointer';
          sendToBarBtn.style.boxShadow = '0 0 6px #4caf50aa';
          sendToBarBtn.style.transform = 'scaleX(-1)';
          sendToBarBtn.onmouseover = () => sendToBarBtn.style.background = '#43a047';
          sendToBarBtn.onmouseout = () => sendToBarBtn.style.background = '#4caf50cc';
          sendToBarBtn.onclick = async () => {
            await _pushImageToBar(img.src, 'chat_image.png');
          };
          bub.appendChild(sendToBarBtn);
  
      } else if (isVideo) {
          const videoContainer = document.createElement('div');
          videoContainer.style.position = 'relative';
          
          const loader = document.createElement('div');
          loader.style.position = 'absolute';
          loader.style.top = '0';
          loader.style.left = '0';
          loader.style.right = '0';
          loader.style.bottom = '0';
          loader.style.display = 'flex';
          loader.style.alignItems = 'center';
          loader.style.justifyContent = 'center';
          loader.style.backgroundColor = 'rgba(0,0,0,0.3)';
          loader.innerHTML = `
            <div class="spinner"></div>
            <span style="margin-left:10px;color:#fff">${_t016('common.loading', 'جاري التحميل...')}</span>
          `;
          
          const video = document.createElement('video');
          video.style.width = '100%';
          video.style.maxHeight = '400px';
          video.style.borderRadius = '12px';
          video.controls = true;
          video.autoplay = true;
          video.muted = true;
          video.playsInline = true;
          
          video.onloadeddata = () => {
            videoContainer.removeChild(loader);
          };
          
          video.onerror = () => {
            loader.innerHTML = '<span style="color:#fff">' + _t016('chat.video_load_failed', '❌ تعذر تحميل الفيديو') + '</span>';
          };
          
          video.src = content;
          videoContainer.appendChild(loader);
          videoContainer.appendChild(video);
          bub.appendChild(videoContainer);
          chatMedia.push({type: 'video', src: content});
          
      } else if (isAudio) {
          bub.style.position = 'relative';
          const audio = document.createElement('audio');
          audio.src = content;
          audio.controls = true;
          audio.style.width = '100%';
          audio.style.marginTop = '34px';
          audio.style.marginBottom = '-20px';
          bub.appendChild(audio);
          chatMedia.push({type: 'audio', src: content});

          const btn = document.createElement('button');
          btn.className = 'regen-btn';
          btn.textContent = '⟳';
          btn.title = _t016('chat.regen', 'إعادة توليد');
          btn.onclick = () => regen(msg, negP);
          bub.appendChild(btn);
          
      } else {
          bub.textContent = content;
          bub.style.cursor = 'pointer';
          bub.onclick = () => {
            neg = false;
            posB = content;
            // إن تم تمرير برومت سلبي مع هذه الفقاعة من renderAssistant
            try { if (typeof negP === 'string' && negP.trim()) { negB = negP; } } catch {}
            mainInput.value = content;
            mainInput.placeholder = _t016('composer.type_here', 'اكتب هنا …');
            try { mainInput.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
            try { mainInput.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
            updateSend();
          };
      }
  
      wrap.appendChild(bub);
      chat.appendChild(wrap);
      _scrollChatToBottom(shouldStickToBottom);
      _updateJumpToBottomVisibility();
      _updateJumpToBottomVisibility();
    }

    (function _installJumpToBottomOnce() {
      if (window.__jumpToBottomInstalled__) return;
      window.__jumpToBottomInstalled__ = true;

      const bind = () => {
        if (!chat) return;
        _getJumpToBottomBtn();
        chat.addEventListener('scroll', () => _updateJumpToBottomVisibility(true), { passive: true });
        window.addEventListener('resize', () => _updateJumpToBottomVisibility(false), { passive: true });
        _updateJumpToBottomVisibility();
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind, { once: true });
      } else {
        bind();
      }
    })();

    