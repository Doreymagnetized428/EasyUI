/* Feature #028 — التهيئة الأولى */

    const _t028 = (key, fallback, params) => {
      try { return window.t ? window.t(key, fallback, params) : fallback; } catch(e) { return fallback; }
    };

    usernameInput.value = currentUsername;
    updateSend();
    adjust();

    // إضافة حدث لاختيار القالب المفضل
    document.addEventListener('contextmenu', e => {
      const templateBtn = e.target.closest('.template-btn');
      if (templateBtn && !templateBtn.classList.contains('folder')) {
        e.preventDefault();
        const index = Array.from(tplSlider.children).indexOf(templateBtn);
        if (index >= 0) {
          const template = templates[index];
          if (!userSettings.favorite_templates.some(t => t.img === template.img)) {
            addToFavorites(template);
            alert(_t028('favorites.added', 'تم إضافة القالب إلى المفضلة'));
          }
        }
      }
    });
  
// ==== Restoring UI helpers ====
let __restoreUiShownAt = 0;
let __restoreUiHideTimer = null;
function showRestoringUI() {
  __restoreUiShownAt = Date.now();
  if (__restoreUiHideTimer) {
    clearTimeout(__restoreUiHideTimer);
    __restoreUiHideTimer = null;
  }
  const b = document.getElementById('restoringBanner');
  const o = document.getElementById('sessionLoader');
  if (b) b.style.display = 'block';
  if (o) o.style.display = 'block';
  try { document.getElementById('sendBtn').disabled = true; } catch(_) {}
  try { document.getElementById('prompt').disabled = true; } catch(_) {}
}
function hideRestoringUI() {
  const MIN_VISIBLE_MS = 250;
  const elapsed = Date.now() - (__restoreUiShownAt || 0);
  const doHide = function(){
    const b = document.getElementById('restoringBanner');
    const o = document.getElementById('sessionLoader');
    if (b) b.style.display = 'none';
    if (o) o.style.display = 'none';
    try { document.getElementById('sendBtn').disabled = false; } catch(_) {}
    try { document.getElementById('prompt').disabled = false; } catch(_) {}
  };

  if (elapsed >= MIN_VISIBLE_MS) {
    doHide();
    return;
  }

  if (__restoreUiHideTimer) clearTimeout(__restoreUiHideTimer);
  __restoreUiHideTimer = setTimeout(function(){
    __restoreUiHideTimer = null;
    doHide();
  }, Math.max(0, MIN_VISIBLE_MS - elapsed));
}

