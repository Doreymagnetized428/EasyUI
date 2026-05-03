# نظام الإضافات (Plugins)

## البنية الأساسية

كل إضافة يجب أن تكون في مجلد منفصل يحتوي على:

```
plugins/
  my_plugin/
    manifest.json   (معلومات الإضافة)
    plugin.js       (كود الإضافة)
    icon.png        (اختياري: أيقونة 64x64)
```

## ملف manifest.json

```json
{
  "id": "my_plugin",
  "name": "اسم الإضافة",
  "name_en": "Plugin Name",
  "description": "وصف قصير للإضافة",
  "version": "1.0.0",
  "author": "اسم المطور",
  "icon": "icon.png",
  "main": "plugin.js",
  "enabled": true,
  "permissions": ["chat", "ui", "api"]
}
```

## plugin.js

```javascript
(function() {
  'use strict';
  
  // سجل الإضافة
  if (window.registerPlugin) {
    window.registerPlugin({
      id: 'my_plugin',
      name: 'اسم الإضافة',
      
      // عند تحميل الإضافة
      onLoad: function() {
        console.log('تم تحميل الإضافة');
      },
      
      // عند إرسال رسالة
      onMessageSent: function(message) {
        // معالجة الرسالة
      },
      
      // عند استقبال رد
      onResponseReceived: function(response) {
        // معالجة الرد
      }
    });
  }
})();
```

## الأذونات المتاحة

- `chat`: الوصول لرسائل المحادثة
- `ui`: تعديل واجهة المستخدم
- `api`: إجراء طلبات API
- `storage`: حفظ بيانات محلية
- `files`: التعامل مع الملفات
