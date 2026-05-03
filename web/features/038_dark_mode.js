/* Feature #038 — Dark Mode */

(function() {
  'use strict';
  
  // تحميل تفضيل الوضع الداكن من localStorage
  function loadDarkMode() {
    const saved = localStorage.getItem('darkMode');
    const isDark = saved === 'true';
    applyDarkMode(isDark);
    
    // تحديث checkbox
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) {
      toggle.checked = isDark;
    }
  }
  
  // تطبيق الوضع الداكن
  function applyDarkMode(isDark) {
    if (isDark) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', isDark.toString());
  }
  
  // الاستماع لتغيير checkbox
  function initToggle() {
    const toggle = document.getElementById('darkModeToggle');
    if (!toggle) return;
    
    toggle.addEventListener('change', function() {
      applyDarkMode(this.checked);
    });
  }
  
  // تحميل من إعدادات المستخدم إذا كانت متاحة
  document.addEventListener('DOMContentLoaded', function() {
    // تحميل من localStorage أولاً
    loadDarkMode();
    
    // تهيئة الـ toggle
    initToggle();
  });
  
  // الاستماع لحدث تحميل إعدادات المستخدم
  const originalLoadSettings = window.loadUserSettings;
  if (originalLoadSettings) {
    window.loadUserSettings = function() {
      return originalLoadSettings.apply(this, arguments).then(function(settings) {
        if (settings && typeof settings.dark_mode !== 'undefined') {
          applyDarkMode(settings.dark_mode);
          const toggle = document.getElementById('darkModeToggle');
          if (toggle) {
            toggle.checked = settings.dark_mode;
          }
        }
        return settings;
      });
    };
  }
  
  // حفظ التفضيل مع إعدادات المستخدم
  window.getDarkModePreference = function() {
    const toggle = document.getElementById('darkModeToggle');
    return toggle ? toggle.checked : false;
  };
  
  console.log('[Dark Mode] Feature loaded');
})();
