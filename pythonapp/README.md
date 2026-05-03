# 📁 مجلد pythonapp - دليل شامل

## 📖 نظرة عامة

هذا المجلد يحتوي على سكربتات Python و Batch التي يمكن تشغيلها من الواجهة باستخدام:
```
pythonapp <اسم_السكربت> <الأوامر>
```

---

## 📂 الملفات الموجودة

### 1️⃣ **colorgen** - توليد صور ملونة

**الملفات:**
- `colorgen.py` - البرنامج الأساسي
- `colorgen.bat` - ملف التشغيل

**الاستخدام:**
```
pythonapp colorgen red
pythonapp colorgen blue
pythonapp colorgen green
```

**الألوان المدعومة:**
- red, blue, green, yellow, orange
- purple, pink, black, white, gray

**النتيجة:**
- يتم إنشاء صورة بحجم 512x512 في مجلد pythonapp
- اسم الملف: `red_image.png`, `blue_image.png`, إلخ

**الكود:**
```batch
# colorgen.bat
python "%~dp0colorgen.py" %1
                          ↑
                    اللون (كلمة واحدة)
```

---

### 2️⃣ **createfile** - إنشاء ملف نصي

**الملفات:**
- `createfile.py` - البرنامج الأساسي
- `createfile.bat` - ملف التشغيل

**الاستخدام:**
```
pythonapp createfile مرحبا بالعالم
pythonapp createfile هذا ملف تجريبي
pythonapp createfile أي نص تريده هنا
```

**النتيجة:**
- يتم إنشاء ملف نصي في مجلد pythonapp
- اسم الملف: `file_20260103_143052.txt` (مع التاريخ والوقت)
- المحتوى: النص الذي كتبته

**الكود:**
```batch
# createfile.bat
python "%~dp0createfile.py" %*
                            ↑
                    جميع الكلمات
```

---

### 3️⃣ **gallery** - تحميل باستخدام gallery-dl

**الملفات:**
- `gallery.py` - البرنامج الأساسي
- `gallery.bat` - ملف التشغيل

**الاستخدام:**
```
pythonapp gallery https://example.com/gallery/123
pythonapp gallery https://twitter.com/user/status/123
```

**المميزات:**
- ✅ يفتح نافذة CMD منفصلة
- ✅ لا يشغل السيرفر
- ✅ يمكنك إغلاق الواجهة والتحميل مستمر

**المتطلبات:**
يجب تثبيت gallery-dl أولاً:
```bash
pip install gallery-dl
```

**الكود:**
```batch
# gallery.bat
python "%~dp0gallery.py" %1
                         ↑
                    الرابط
```

---

### 4️⃣ **download** - تحميل من يوتيوب (مثال)

**الملفات:**
- `download.bat` - ملف تجريبي

**الاستخدام:**
```
pythonapp download https://youtube.com/watch?v=abc123
```

**ملاحظة:**
هذا مثال فقط. لتفعيله، قم بتثبيت yt-dlp:
```bash
pip install yt-dlp
```

---

### 5️⃣ **twmd** - تشغيل Twitter Media Downloader

**الملفات:**
- `twmd.py` - البرنامج الأساسي
- `twmd.bat` - ملف التشغيل

**الاستخدام:**
```bash
pythonapp twmd username
```

**الأمر الذي يتم تشغيله:**
```bash
twmd.exe -L -u username -a -r -o C:\Users\GAMER\Desktop\Newfolder(2)\twitter-media-downloader\dow
```

**ملاحظات:**
- يتم استبدال `username` باسم المستخدم الذي تكتبه.
- يبحث السكربت عن `twmd.exe` داخل مجلد `pythonapp` أو داخل `C:\Users\GAMER\Desktop\Newfolder(2)\twitter-media-downloader`.
- يتم تشغيله في نافذة مستقلة على Windows.

وعدّل الملف:
```batch
@echo off
yt-dlp %1 -o "downloads/%%(title)s.%%(ext)s"
```

---

## 🔧 كيفية إنشاء سكربت جديد

### الخطوات:

1. **أنشئ ملف Python** (مثل: `newscrip.py`)
2. **أنشئ ملف BAT** (مثل: `newscript.bat`)
3. **في BAT، اكتب:**
   ```batch
   @echo off
   chcp 65001 > nul
   python "%~dp0newscript.py" %*
   ```

4. **استخدمه:**
   ```
   pythonapp newscript <أوامر>
   ```

---

## 📝 شرح المتغيرات في BAT

| المتغير | المعنى | مثال |
|---------|--------|------|
| `%1` | الأمر الأول | `red` |
| `%2` | الأمر الثاني | `500` |
| `%3` | الأمر الثالث | `output.txt` |
| `%*` | **جميع الأوامر** | `red blue green` |
| `%~dp0` | مسار المجلد الحالي | `C:\...\pythonapp\` |

### متى تستخدم أيهما؟

- **`%1`** → عندما تحتاج كلمة واحدة فقط (مثل اللون)
- **`%*`** → عندما تحتاج جملة كاملة (مثل النص)
- **`%1 %2 %3`** → عندما تحتاج أوامر محددة

---

## 🎯 أمثلة متقدمة

### مثال 1: برنامج بأوامر متعددة

**resize.bat:**
```batch
@echo off
python "%~dp0resize.py" %1 %2 %3
```

**الاستخدام:**
```
pythonapp resize image.png 800 600
                 ↓         ↓   ↓
                %1        %2  %3
```

---

### مثال 2: برنامج بقيم افتراضية

**convert.bat:**
```batch
@echo off
python "%~dp0convert.py" %1 jpg 95
                         ↑  ↑   ↑
                      ملف ثابت ثابت
```

**الاستخدام:**
```
pythonapp convert photo.png
```
يصبح: `photo.png jpg 95`

---

### مثال 3: فتح نافذة منفصلة

**longtask.py:**
```python
import subprocess

subprocess.Popen(
    ['start', 'cmd', '/k', 'python task.py'],
    shell=True,
    creationflags=subprocess.CREATE_NEW_CONSOLE
)
```

---

## ⚙️ نصائح مهمة

### 1. الترميز UTF-8
إذا واجهت مشاكل مع النصوص العربية، أضف في بداية Python:
```python
import sys
import io
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
```

### 2. التعامل مع الأخطاء
استخدم try-except:
```python
try:
    # الكود هنا
except Exception as e:
    print(f"خطأ: {e}")
```

### 3. المسارات
استخدم دائماً:
```python
script_dir = os.path.dirname(os.path.abspath(__file__))
```

---

## 📚 مكتبات مفيدة

| المكتبة | الاستخدام | التثبيت |
|---------|-----------|---------|
| `gallery-dl` | تحميل الصور | `pip install gallery-dl` |
| `yt-dlp` | تحميل الفيديوهات | `pip install yt-dlp` |
| `Pillow` | معالجة الصور | `pip install Pillow` |
| `requests` | طلبات HTTP | `pip install requests` |

---

## 🚀 خطوات سريعة

### إنشاء سكربت جديد في دقيقة:

1. انسخ `createfile.py` و `createfile.bat`
2. غيّر الاسم إلى `myscript.py` و `myscript.bat`
3. عدّل الكود في Python
4. جرّب: `pythonapp myscript <أوامر>`

---

## 📞 المساعدة

إذا واجهت مشاكل:
1. تأكد من تثبيت Python
2. تأكد من وجود الملفين (.py و .bat)
3. تحقق من صحة الأوامر
4. راجع رسائل الخطأ

---

**تاريخ التحديث:** 2026-01-03
**الإصدار:** 1.0
