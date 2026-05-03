/* Feature #011 — قوائم الفرع */

    modeBtn.onclick = () => {
      modeMenu.style.display = modeMenu.style.display === 'block' ? 'none' : 'block';
    };
    document.body.addEventListener('click', e => {
      if (!modeBtn.contains(e.target) && !modeMenu.contains(e.target)) {
        modeMenu.style.display = 'none';
      }
    });
    $$('#modeMenu div').forEach(d => d.onclick = () => {
      mode = d.dataset.mode;
      modeBtn.textContent = mode;
      modeMenu.style.display = 'none';
    });

    