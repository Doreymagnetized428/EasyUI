/* Feature #000 — i18n bootstrap */

(function () {
  const SUPPORTED = ['ar', 'en', 'zh', 'ja'];
  const DEFAULT_LANG = 'ar';
  const STORAGE_KEY = 'ui_lang';

  let currentLang = DEFAULT_LANG;
  let dict = {};

  function normalizeLang(lang) {
    const raw = String(lang || '').toLowerCase();
    const short = raw.split('-')[0];
    return SUPPORTED.includes(short) ? short : DEFAULT_LANG;
  }

  function getSavedLang() {
    try {
      const fromStorage = localStorage.getItem(STORAGE_KEY);
      if (fromStorage) return normalizeLang(fromStorage);
    } catch (e) {}

    const fromHtml = document.documentElement.getAttribute('lang');
    if (fromHtml) return normalizeLang(fromHtml);

    try {
      return normalizeLang(navigator.language || navigator.userLanguage || DEFAULT_LANG);
    } catch (e) {
      return DEFAULT_LANG;
    }
  }

  function getByPath(obj, path) {
    if (!obj || !path) return undefined;
    return String(path).split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
  }

  function formatTemplate(str, params) {
    if (!params || typeof str !== 'string') return str;
    return str.replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
      return params[key] !== undefined ? String(params[key]) : '{' + key + '}';
    });
  }

  async function loadLocale(lang) {
    const url = '/static/locales/' + encodeURIComponent(lang) + '.json';
    const res = await fetch(url, { cache: 'default' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' while loading locale');
    return await res.json();
  }

  function t(key, fallback, params) {
    const fromDict = getByPath(dict, key);
    const raw = fromDict !== undefined ? fromDict : (fallback !== undefined ? fallback : key);
    return formatTemplate(raw, params);
  }

  function translateElement(el) {
    if (!el || el.nodeType !== 1) return;

    if (el.hasAttribute('data-i18n')) {
      const key = el.getAttribute('data-i18n');
      const fallback = (el.__i18nFallbackText !== undefined) ? el.__i18nFallbackText : el.textContent;
      el.__i18nFallbackText = fallback;
      el.textContent = t(key, fallback);
    }

    if (el.hasAttribute('data-i18n-placeholder')) {
      const key = el.getAttribute('data-i18n-placeholder');
      const fallback = (el.__i18nFallbackPlaceholder !== undefined) ? el.__i18nFallbackPlaceholder : (el.getAttribute('placeholder') || '');
      el.__i18nFallbackPlaceholder = fallback;
      el.setAttribute('placeholder', t(key, fallback));
    }

    if (el.hasAttribute('data-i18n-title')) {
      const key = el.getAttribute('data-i18n-title');
      const fallback = (el.__i18nFallbackTitle !== undefined) ? el.__i18nFallbackTitle : (el.getAttribute('title') || '');
      el.__i18nFallbackTitle = fallback;
      el.setAttribute('title', t(key, fallback));
    }

    if (el.hasAttribute('data-i18n-aria-label')) {
      const key = el.getAttribute('data-i18n-aria-label');
      const fallback = (el.__i18nFallbackAriaLabel !== undefined) ? el.__i18nFallbackAriaLabel : (el.getAttribute('aria-label') || '');
      el.__i18nFallbackAriaLabel = fallback;
      el.setAttribute('aria-label', t(key, fallback));
    }
  }

  function translateTree(root) {
    const node = root || document;
    if (node.nodeType === 1) translateElement(node);

    const list = (node.querySelectorAll)
      ? node.querySelectorAll('[data-i18n],[data-i18n-placeholder],[data-i18n-title],[data-i18n-aria-label]')
      : [];
    for (let i = 0; i < list.length; i++) translateElement(list[i]);
  }

  function applyDocumentLang(lang) {
    const html = document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  }

  async function setLanguage(lang, options) {
    const opts = options || {};
    const normalized = normalizeLang(lang);
    currentLang = normalized;

    try {
      dict = await loadLocale(normalized);
    } catch (e) {
      console.warn('[i18n] Failed to load locale, fallback to ar:', e);
      currentLang = DEFAULT_LANG;
      try {
        dict = await loadLocale(DEFAULT_LANG);
      } catch (e2) {
        console.warn('[i18n] Failed to load fallback locale:', e2);
        dict = {};
      }
    }

    if (opts.save !== false) {
      try { localStorage.setItem(STORAGE_KEY, currentLang); } catch (e) {}
    }

    applyDocumentLang(currentLang);
    translateTree(document);

    const langSelect = document.getElementById('languageSelect');
    if (langSelect && langSelect.value !== currentLang) langSelect.value = currentLang;

    document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: currentLang } }));
    return currentLang;
  }

  window.t = t;
  window.getLanguage = function () { return currentLang; };
  window.setLanguage = setLanguage;
  window.i18nTranslateNode = translateTree;

  document.addEventListener('DOMContentLoaded', async function () {
    await setLanguage(getSavedLang(), { save: false });

    const langSelect = document.getElementById('languageSelect');
    if (langSelect) {
      langSelect.value = currentLang;
      langSelect.addEventListener('change', function () {
        setLanguage(langSelect.value, { save: true });
      });
    }

    const observer = new MutationObserver(function (mutations) {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        for (let j = 0; j < m.addedNodes.length; j++) {
          const n = m.addedNodes[j];
          if (n && n.nodeType === 1) translateTree(n);
        }
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });
})();
