/* Feature #012 — إدخال إيجابي/سلبي */

    mainInput.addEventListener('input', () => {
      (!neg ? posB = mainInput.value : negB = mainInput.value);
      updateSend();
    });
    toggleBtn.onclick = () => {
      (!neg ? posB = mainInput.value : negB = mainInput.value);
      neg = !neg;
      mainInput.value = neg ? negB : posB;
      mainInput.placeholder = neg ? 'اكتب البرومبت السلبي هنا' : 'اكتب هنا …';
      updateSend();
      if (typeof adjustMainInputHeight === 'function') adjustMainInputHeight();
    };

    