/* Feature #027 — ربط الأحداث */

    sendBtn.onclick = send;
    mainInput.addEventListener('keydown', e => {
      // السماح بـ Ctrl+Enter أو Cmd+Enter للإرسال (على Windows/Linux و Mac)
      // Enter وحده يُضيف سطر جديد
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        !sendBtn.disabled && send();
      }
    });

    userMenuBtn.onclick = openUserMenu;
    userMenuClose.onclick = closeUserMenu;
    sessionsMenuBtn.onclick = openSessionsMenu;
    sessionsMenuClose.onclick = closeSessionsMenu;

    // Session save/delete/load/clear handlers are managed centrally
    // in 025_user_sessions.js to avoid duplicate click execution.

    