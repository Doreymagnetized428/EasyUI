/* Feature #008 — تحميل القوالب من الباك إند */

    (async () => {
      try {
        templates = await (await fetch(`${API_BASE}/api/templates`)).json();
      } catch {
        templates = [];
      }
      renderTpl();
      loadUserSettings();
      // ملاحظة: استرجاع الجلسة يتم حصراً عبر 025_user_sessions.js
      // لتفادي ازدواجية التدفق وعدم اتساق ظهور رسالة "جاري تحميل الجلسة السابقة".
      loadUserSessions();
    })();

    