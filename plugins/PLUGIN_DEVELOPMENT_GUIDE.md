# دليل تطوير الإضافات - Plugin Development Guide

## 📚 نظرة عامة

نظام الإضافات في EasyUI يسمح لك بتوسيع وظائف التطبيق بسهولة من خلال إنشاء مكونات مستقلة. كل إضافة تعمل في بيئة معزولة ويمكنها التفاعل مع النظام من خلال hooks وأحداث محددة.

---

## 📁 البنية الأساسية للإضافة

يجب أن تكون كل إضافة في مجلد منفصل داخل `plugins/`:

```
plugins/
└── my_plugin/
    ├── manifest.json       (مطلوب - معلومات الإضافة)
    ├── plugin.js          (مطلوب - الكود الرئيسي)
    ├── icon.png           (اختياري - أيقونة الإضافة)
    └── README.md          (اختياري - وثائق)
```

---

## 📋 ملف manifest.json

ملف manifest.json يحتوي على معلومات الإضافة الأساسية:

```json
{
  "id": "my_plugin",
  "name": "اسم الإضافة",
  "name_en": "Plugin Name",
  "description": "وصف قصير للإضافة",
  "version": "1.0.0",
  "author": "اسم المطور",
  "type": "action",
  "main": "plugin.js",
  "enabled": true,
  "icon_url": "/plugins/my_plugin/icon.png",
  "instructions": "تعليمات استخدام الإضافة (اختياري)",
  "hasSettings": false
}
```

### الحقول المتاحة:

| الحقل | مطلوب؟ | الوصف |
|------|--------|-------|
| `id` | ✅ | معرّف فريد للإضافة (استخدم اسم المجلد) |
| `name` | ✅ | اسم الإضافة بالعربية |
| `name_en` | ❌ | اسم الإضافة بالإنجليزية |
| `description` | ❌ | وصف مختصر |
| `version` | ❌ | رقم الإصدار |
| `author` | ❌ | اسم المطور |
| `type` | ✅ | نوع الإضافة: `"action"` أو `"toggle"` |
| `main` | ✅ | اسم ملف JavaScript الرئيسي |
| `enabled` | ❌ | تفعيل/تعطيل الإضافة (افتراضي: `true`) |
| `icon_url` | ❌ | رابط الأيقونة |
| `instructions` | ❌ | نص تعليمات مفصّل |
| `hasSettings` | ❌ | هل الإضافة لها إعدادات؟ |

---

## ⚙️ أنواع الإضافات

### 1. إضافة نوع `action` (تنفيذ فوري)
- تُنفّذ عند النقر عليها مباشرة
- لا تظهر checkbox للتفعيل/التعطيل
- مثال: إضافة Multi-Angle Control

```json
{
  "type": "action"
}
```

### 2. إضافة نوع `toggle` (تبديل)
- تظهر checkbox للتفعيل/التعطيل
- تعمل في الخلفية عند التفعيل
- مثال: إضافة Site Shortcuts

```json
{
  "type": "toggle"
}
```

---

## 💻 ملف plugin.js

هيكل ملف JavaScript الأساسي:

```javascript
/* اسم الإضافة - وصف مختصر */
(function() {
  'use strict';
  
  console.log('[Plugin Name] loading...');
  
  // المتغيرات والحالة
  let state = {
    // بيانات الإضافة
  };
  
  // دالة التهيئة
  function init() {
    console.log('[Plugin Name] تم التفعيل');
    // كود التهيئة هنا
  }
  
  // دالة التنفيذ (للإضافات من نوع action)
  function executeAction() {
    console.log('[Plugin Name] تنفيذ العملية');
    // الكود الذي يُنفذ عند النقر
  }
  
  // تسجيل الإضافة
  if (window.registerPlugin) {
    window.registerPlugin({
      id: 'my_plugin',
      name: 'اسم الإضافة',
      version: '1.0.0',
      onLoad: init,
      onAction: executeAction, // للإضافات من نوع action
      closePluginsDialogOnAction: true // إغلاق النافذة بعد التنفيذ؟
    });
  }
  
  // تشغيل تلقائي عند التحميل
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

---

## 🎣 الـ Hooks المتاحة

يمكن للإضافة الاستماع إلى أحداث النظام من خلال hooks:

### 1. `onLoad`
يُنفّذ مرة واحدة عند تحميل الإضافة:

```javascript
onLoad: function() {
  console.log('الإضافة تم تحميلها');
}
```

### 2. `onAction`
يُنفّذ عند النقر على إضافة من نوع `action`:

```javascript
onAction: function() {
  // فتح نافذة، تنفيذ عملية، إلخ
}
```

### 3. `onMessageSent`
يُنفّذ عند إرسال المستخدم رسالة:

```javascript
onMessageSent: function(data) {
  console.log('تم إرسال رسالة:', data.message);
}
```

### 4. `onResponseReceived`
يُنفّذ عند استلام رد من الخادم:

```javascript
onResponseReceived: function(data) {
  console.log('تم استلام رد:', data.response);
}
```

### 5. `onUIReady`
يُنفّذ عند جاهزية واجهة المستخدم:

```javascript
onUIReady: function() {
  console.log('الواجهة جاهزة');
}
```

### 6. `onSettings`
يُنفّذ عند النقر على زر الإعدادات (إذا كان `hasSettings: true`):

```javascript
onSettings: function() {
  // عرض نافذة الإعدادات
}
```

---

## 🔧 خيارات التسجيل

عند تسجيل الإضافة باستخدام `window.registerPlugin()`:

```javascript
window.registerPlugin({
  id: 'my_plugin',              // مطلوب: المعرّف
  name: 'اسم الإضافة',           // مطلوب: الاسم
  version: '1.0.0',             // اختياري: الإصدار
  onLoad: initFunction,         // اختياري: دالة التحميل
  onAction: actionFunction,     // اختياري: دالة التنفيذ (للـ action)
  onMessageSent: msgFunction,   // اختياري: عند إرسال رسالة
  onResponseReceived: respFunc, // اختياري: عند استلام رد
  onUIReady: uiFunction,        // اختياري: عند جاهزية UI
  onSettings: settingsFunction, // اختياري: عند فتح الإعدادات
  closePluginsDialogOnAction: true // اختياري: إغلاق نافذة الإضافات بعد التنفيذ
});
```

---

## 📌 أمثلة عملية

### مثال 1: إضافة بسيطة تعرض تنبيه

**manifest.json:**
```json
{
  "id": "hello_plugin",
  "name": "مرحبا",
  "type": "action",
  "main": "plugin.js",
  "enabled": true
}
```

**plugin.js:**
```javascript
(function() {
  'use strict';
  
  function showHello() {
    alert('مرحباً من الإضافة!');
  }
  
  if (window.registerPlugin) {
    window.registerPlugin({
      id: 'hello_plugin',
      name: 'مرحبا',
      onAction: showHello,
      closePluginsDialogOnAction: true
    });
  }
})();
```

### مثال 2: إضافة تضيف نصاً إلى مربع الإدخال

```javascript
(function() {
  'use strict';
  
  function addText() {
    const input = document.getElementById('mainInput')
      || document.querySelector('#composer textarea')
      || document.getElementById('userInput');
    
    if (!input) {
      alert('لم يتم العثور على مربع الإدخال');
      return;
    }
    
    const textToAdd = 'نص من الإضافة';
    const currentValue = input.value.trim();
    input.value = currentValue ? `${currentValue}, ${textToAdd}` : textToAdd;
    
    // تفعيل الأحداث لتحديث الواجهة
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }
  
  if (window.registerPlugin) {
    window.registerPlugin({
      id: 'text_adder',
      name: 'إضافة نص',
      onAction: addText,
      closePluginsDialogOnAction: true
    });
  }
})();
```

### مثال 3: إضافة مع نافذة مخصصة

```javascript
(function() {
  'use strict';
  
  function showCustomDialog() {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 12px; max-width: 500px;">
        <h2 style="margin: 0 0 20px 0;">نافذة مخصصة</h2>
        <p>هذه نافذة من الإضافة!</p>
        <button onclick="this.closest('div[style*=fixed]').remove()" 
          style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer;">
          إغلاق
        </button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // إغلاق عند النقر على الخلفية
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
  }
  
  if (window.registerPlugin) {
    window.registerPlugin({
      id: 'custom_dialog',
      name: 'نافذة مخصصة',
      onAction: showCustomDialog,
      closePluginsDialogOnAction: true
    });
  }
})();
```

---

## 🛠️ الوصول إلى عناصر الواجهة

### الحصول على مربع الإدخال:
```javascript
const input = document.getElementById('mainInput')
  || document.querySelector('#composer textarea')
  || document.getElementById('userInput');
```

### الحصول على زر الإرسال:
```javascript
const sendBtn = document.getElementById('sendBtn');
```

### إطلاق أحداث التحديث:
```javascript
input.dispatchEvent(new Event('input', { bubbles: true }));
input.dispatchEvent(new Event('change', { bubbles: true }));
```

### تركيز مربع الإدخال:
```javascript
input.focus();
```

---

## 📦 تحميل مكتبات خارجية

### مثال: تحميل Three.js
```javascript
function loadThreeJS(callback) {
  if (typeof THREE !== 'undefined') {
    callback();
    return;
  }
  
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  script.onload = () => {
    console.log('Three.js loaded');
    callback();
  };
  script.onerror = () => {
    console.error('Failed to load Three.js');
  };
  document.head.appendChild(script);
}
```

---

## 🎨 إضافة أنماط CSS

### داخل ملف plugin.js:
```javascript
const style = document.createElement('style');
style.textContent = `
  .my-plugin-button {
    padding: 10px 20px;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }
  
  .my-plugin-button:hover {
    background: #45a049;
  }
`;
document.head.appendChild(style);
```

### أو في ملف CSS منفصل:
```javascript
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/plugins/my_plugin/style.css';
document.head.appendChild(link);
```

---

## 🔍 التصحيح والتطوير

### 1. استخدام console.log:
```javascript
console.log('[Plugin Name] رسالة تصحيح');
console.error('[Plugin Name] خطأ:', error);
console.warn('[Plugin Name] تحذير');
```

### 2. التحقق من تحميل الإضافة:
افتح Console في المتصفح وابحث عن رسائل مثل:
```
[Plugin Manager] تسجيل الإضافة: my_plugin
[Plugin Manager] تم تحميل: my_plugin
```

### 3. التحقق من الإضافات المحملة:
```javascript
console.log(window.PLUGINS_LOADED);
```

### 4. اختبار الـ hooks:
```javascript
// اختبار إرسال رسالة
window.triggerPluginHook('onMessageSent', { message: 'test' });

// اختبار استلام رد
window.triggerPluginHook('onResponseReceived', { response: 'test' });
```

---

## ⚠️ أفضل الممارسات

### 1. استخدم IIFE لعزل الكود:
```javascript
(function() {
  'use strict';
  // كود الإضافة هنا
})();
```

### 2. تحقق من وجود العناصر قبل الوصول إليها:
```javascript
const input = document.getElementById('mainInput');
if (!input) {
  console.error('Input not found');
  return;
}
```

### 3. نظف الموارد عند الإزالة:
```javascript
let animationFrame = null;

function cleanup() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }
}

// استدعاء cleanup عند الحاجة
```

### 4. استخدم معرفات فريدة للعناصر:
```javascript
const uniqueId = 'my-plugin-modal-' + Date.now();
modal.id = uniqueId;
```

### 5. تعامل مع الأخطاء بشكل صحيح:
```javascript
try {
  // كود قد يفشل
} catch(e) {
  console.error('[Plugin Name] خطأ:', e);
  alert('حدث خطأ في الإضافة');
}
```

---

## 🌐 التعامل مع اللغات المتعددة

استخدم حقول `name` و`name_en` في manifest.json:

```json
{
  "name": "التحكم بالزوايا",
  "name_en": "Angle Control",
  "description": "التحكم في زوايا الكاميرا ثلاثية الأبعاد",
  "instructions": "اضغط على الإضافة لفتح محرر الزوايا..."
}
```

في الكود:
```javascript
const lang = document.documentElement.lang || 'ar';
const text = lang === 'en' ? 'Click here' : 'اضغط هنا';
```

---

## 📝 نصائح إضافية

1. **اختبر الإضافة جيداً** على متصفحات مختلفة
2. **استخدم أسماء متغيرات واضحة** وتعليقات توضيحية
3. **لا تعدّل المتغيرات العامة** إلا إذا كان ضرورياً
4. **احفظ حالة الإضافة** في localStorage إذا احتجت
5. **اجعل الواجهة responsive** للأجهزة المحمولة
6. **وثّق الكود** لتسهيل الصيانة

---

## 🚀 نشر الإضافة

1. ضع مجلد الإضافة في `plugins/`
2. أعد تشغيل الخادم (أو أعد تحميل الصفحة)
3. افتح قائمة الإضافات من زر 🔌
4. تأكد من ظهور الإضافة وعملها بشكل صحيح

---

## 📖 مثال كامل: إضافة Site Shortcuts

راجع مجلد `plugins/site_shortcuts/` لمثال كامل لإضافة تضيف اختصارات مواقع.

## 📖 مثال كامل: إضافة Multi-Angle Control

راجع مجلد `plugins/multi_angle_control/` لمثال متقدم يستخدم Three.js وواجهة 3D.

---

## 🤝 المساعدة والدعم

إذا واجهتك مشاكل:

1. تحقق من Console للأخطاء
2. تأكد من صحة ملف manifest.json
3. تأكد من تسجيل الإضافة بشكل صحيح
4. راجع الأمثلة الموجودة في `plugins/`

---

## 📄 الملخص السريع

```
1. إنشاء مجلد في plugins/
2. إضافة manifest.json
3. إضافة plugin.js
4. تسجيل الإضافة بـ registerPlugin()
5. اختبار الإضافة
6. إعادة تحميل الصفحة
```

---

**بالتوفيق في تطوير إضافاتك! 🎉**
