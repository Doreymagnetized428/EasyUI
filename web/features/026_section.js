/* Feature #026 — فتح/إغلاق قوائم المستخدم والجلسات */

    function openUserMenu() {
      userMenu.style.display = 'flex';
      document.addEventListener('click', closeUserMenuOnClickOutside);
    }

    function closeUserMenu() {
      userMenu.style.display = 'none';
      document.removeEventListener('click', closeUserMenuOnClickOutside);
    }

    function closeUserMenuOnClickOutside(e) {
      if (!userMenu.contains(e.target) && e.target !== userMenuBtn) {
        closeUserMenu();
      }
    }

    function openSessionsMenu() {
      sessionsMenu.style.display = 'flex';
      document.addEventListener('click', closeSessionsMenuOnClickOutside);
    }

    function closeSessionsMenu() {
      sessionsMenu.style.display = 'none';
      document.removeEventListener('click', closeSessionsMenuOnClickOutside);
    }

    function closeSessionsMenuOnClickOutside(e) {
      if (!sessionsMenu.contains(e.target) && e.target !== sessionsMenuBtn) {
        closeSessionsMenu();
      hideRestoringUI();
      }
    }

    