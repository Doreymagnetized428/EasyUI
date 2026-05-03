/* Feature #009 — رسم شريط القوالب (مع tooltip) */

    function renderTpl() {
      tplSlider.innerHTML = '';
      templates.forEach((t, i) => {
        const d = document.createElement('div');
        d.className = 'template-btn' + (selectedIndex === i ? ' selected' : '');
        try { d.dataset.id = (t.img || t.label || ('tpl-'+i)); } catch {}
        if (t.is_folder) d.classList.add('folder');

        d.title = t.label || '';

        if (t.img) {
          d.innerHTML =
            `<img src="${t.img}" alt="${escapeHtml(t.label||'')}" title="${escapeHtml(t.label||'')}">` +
            (selectedIndex === i ? '<div class="tick">✔</div>' : '');
        } else {
          const lbl = escapeHtml(t.label||'');
          d.innerHTML = `
            <svg width="78" height="78" viewBox="0 0 64 64" style="border-radius:14px;background:#ffd54f" title="${lbl}">
              <title>${lbl}</title>
              <path d="M6 18h20l4 6h28v22c0 4-2 6-6 6H6V18z" fill="#ffb300" stroke="#f57c00" stroke-width="2"/>
            </svg>
            ${selectedIndex === i ? '<div class="tick">✔</div>' : ''}`;
        }

        d.onclick = () => {
          if (t.is_folder) {
            openFolderModal(t, i);
          } else {
            selectedIndex = (selectedIndex === i ? null : i);
            selectedTemplate = (selectedIndex === null ? null : t);
            renderTpl();
            updateSend();
          }
        };
        tplSlider.appendChild(d);
      });
      if (selectedIndex !== null) {
        tplSlider.children[selectedIndex].scrollIntoView({ behavior: 'smooth', inline: 'center' });
      }
    }

    