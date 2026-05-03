/* Feature #024 — تمكين/تعطيل زر الإرسال */

    function updateSend() {
      const txt = (neg ? negB : posB).trim();
      const hasFiles = files.length > 0;
      const tpl = selectedTemplate || (selectedIndex !== null ? templates[selectedIndex] : null);
      const tplHasCmd = (
        tpl &&
        !tpl.is_folder &&
        (
          (tpl.command && tpl.command.trim()) ||
          (tpl.label && tpl.label.trim())
        )
      ) ? true : false;
      sendBtn.disabled = !(txt || hasFiles || tplHasCmd);
    }

    