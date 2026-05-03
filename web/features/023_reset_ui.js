/* Feature #023 — إعادة ضبط الواجهة (composer فقط) */

    const _t023 = (key, fallback, params) => {
      try { return window.t ? window.t(key, fallback, params) : fallback; } catch(e) { return fallback; }
    };

    function resetUI() {
      fileInput.value = '';
      files = [];
      posB = negB = '';
      neg = false;
      mainInput.value = '';
      mainInput.placeholder = _t023('composer.type_here', 'اكتب هنا …');
      filePreviews.innerHTML = '';
      selectedIndex = null;
      selectedTemplate = null;
      renderTpl();
      updateSend();
      if (typeof adjustMainInputHeight === 'function') adjustMainInputHeight();
    }

    