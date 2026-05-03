// 027_settings_adapter.js — Adapter to store Easy-Tag user settings using app storage when available
(function(){
  const NS = "easyTagSettings";
  const pickUser = () => {
    const u = (window.currentUser?.id || window.currentUser?.name ||
               document.getElementById("usernameInput")?.value || "guest");
    return (u||"guest").toString().trim() || "guest";
  };
  const key = () => `${NS}:${pickUser()}`;

  async function load() {
    try {
      if (window.appSettings?.get) {
        const v = await window.appSettings.get(NS); if (v) return v;
      }
      if (window.settings?.get) {
        const v = await window.settings.get(NS); if (v) return v;
      }
      if (window.fetchSettingsFromServer) {
        const v = await window.fetchSettingsFromServer(NS); if (v) return v;
      }
    } catch (e) { /* fall back */ }
    try { return JSON.parse(localStorage.getItem(key()) || "{}"); }
    catch { return {}; }
  }

  async function save(obj) {
    try {
      if (window.appSettings?.set) return await window.appSettings.set(NS, obj);
      if (window.settings?.set) return await window.settings.set(NS, obj);
      if (window.saveSettingsToServer) return await window.saveSettingsToServer(NS, obj);
    } catch (e) { /* fall back */ }
    localStorage.setItem(key(), JSON.stringify(obj));
  }

  window.EasyTagSettings = { load, save, key, NS };
})();
