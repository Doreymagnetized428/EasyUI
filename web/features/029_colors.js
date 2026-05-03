
/* Feature #029 — Color map for tag categories (like TagComplete) */
window.TAG_COLOR_MAP = {
  "-1": ["#e60000", "#800000"],        // أحمر غامق
  "0":  ["#0066ff", "#0033aa"],        // أزرق واضح
  "1":  ["#cc0000", "#660000"],        // أحمر فاقع
  "3":  ["#9933ff", "#4b0082"],        // بنفسجي قوي
  "4":  ["#009933", "#006622"],        // أخضر قوي
  "5":  ["#ff6600", "#cc5200"],        // برتقالي واضح
  "6":  ["#e60000", "#800000"],        // أحمر ثاني
  "7":  ["#0066ff", "#0033aa"],        // أزرق ثاني
  "8":  ["#ffcc00", "#cc9900"],        // أصفر ذهبي
  "9":  ["#ffcc00", "#cc9900"],        // أصفر ذهبي
  "10": ["#9933ff", "#4b0082"],        // بنفسجي ثاني
  "11": ["#009933", "#006622"],        // أخضر ثاني
  "12": ["#ff3300", "#b22222"],        // برتقالي مائل للأحمر
  "14": ["#dddddd", "#222222"],        // رمادي واضح بدل whitesmoke
  "15": ["#228b22", "#006400"]         // أخضر غامق
};
window.resolveTagColor = function(catId, isDark=true){
  const p = window.TAG_COLOR_MAP[String(catId)];
  if (!p) return { bg:null, fg:null };
  const bg = isDark ? p[0] : p[1];
  const fg = (bg === 'whitesmoke') ? '#111' : '#000';
  return { bg, fg };
};
