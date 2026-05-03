/* Feature #018 — فتح/إغلاق مودال تعديل رسالة */

    function openEditMsgModal(historyIndex) {
      const rec = sendHistory[historyIndex];
      if (!rec) return;
      editMsgCurrentIndex = historyIndex;
      editMsgInput.value = rec.messageSent || '';
      editMsgIncludeImgs.checked = !!(rec.filesSent && rec.filesSent.length);
      editMsgModal.style.display = 'flex';
      editMsgInput.focus();
    }
    function closeEditMsgModal() {
      editMsgModal.style.display = 'none';
      editMsgCurrentIndex = null;
    }
    editMsgCancel.onclick = closeEditMsgModal;
    editMsgModal.addEventListener('click', e => {
      if (e.target === editMsgModal) closeEditMsgModal();
    });

    