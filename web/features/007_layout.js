/* Feature #007 — ضبط الواجهة */

    function adjust() {
      // مساحة ثابتة أسفل الصفحة لعرض عبارة التذييل
      const footerGap = 20;
      const lift = open ? 130 : 0;
      const bottom = footerGap + lift;
      composerWrap.style.bottom = bottom + 'px';
      chat.style.paddingBottom = (composerWrap.offsetHeight + bottom + 16) + 'px';
    }

    function adjustMainInputHeight() {
      if (!mainInput) return;

      const styles = window.getComputedStyle(mainInput);
      const lineHeight = parseFloat(styles.lineHeight) || 24;
      const paddingTop = parseFloat(styles.paddingTop) || 0;
      const paddingBottom = parseFloat(styles.paddingBottom) || 0;
      const borderTop = parseFloat(styles.borderTopWidth) || 0;
      const borderBottom = parseFloat(styles.borderBottomWidth) || 0;
      const maxHeight = Math.round((lineHeight * 7) + paddingTop + paddingBottom + borderTop + borderBottom);

      mainInput.style.height = 'auto';
      const nextHeight = Math.max(34, Math.min(mainInput.scrollHeight, maxHeight));
      mainInput.style.height = nextHeight + 'px';
      mainInput.style.overflowY = mainInput.scrollHeight > maxHeight ? 'auto' : 'hidden';

      adjust();
    }

    window.adjustMainInputHeight = adjustMainInputHeight;

    if (mainInput) {
      mainInput.addEventListener('input', adjustMainInputHeight);
      requestAnimationFrame(adjustMainInputHeight);
    }

    window.addEventListener('resize', adjustMainInputHeight);

    