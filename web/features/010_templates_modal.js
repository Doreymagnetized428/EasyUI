/* Feature #010 — فتح مودال مجلد قوالب */

    function openFolderModal(folderTpl, folderIdx) {
      tplFolderTitle.textContent = folderTpl.label || 'قوالب';
      tplFolderGrid.innerHTML = '';
      if (Array.isArray(folderTpl.children)) {
        folderTpl.children.forEach((child, ci) => {
          const item = document.createElement('div');
          item.className = 'tpl-folder-item';
          item.title = child.label || '';
          item.innerHTML = `
            <img src="${child.img || ''}" alt="${escapeHtml(child.label||'')}" title="${escapeHtml(child.label||'')}">
            <div class="lbl" title="${escapeHtml(child.label||'')}">${escapeHtml(child.label||'')}</div>
          `;
          item.onclick = () => {
            selectedTemplate = child;
            selectedIndex = folderIdx;
            closeFolderModal();
            renderTpl();
            updateSend();
          };
          tplFolderGrid.appendChild(item);
        });
      }
      tplFolderModal.classList.add('open');
    }
    function closeFolderModal() {
      tplFolderModal.classList.remove('open');
    }
    tplFolderClose.onclick = closeFolderModal;
    tplFolderModal.addEventListener('click', e => {
      if (e.target === tplFolderModal) closeFolderModal();
    });

    