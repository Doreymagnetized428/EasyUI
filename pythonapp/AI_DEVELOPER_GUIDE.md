# 🤖 تعليمات للذكاء الاصطناعي - pythonapp

## 📋 المهمة

عندما يطلب المستخدم **"اصنع ملف bat لهذا البرنامج"** أو **"حوّل هذا إلى pythonapp"**:

---

## ✅ المطلوب منك

1. **اسأل 3 أسئلة فقط:**
   - ما هو الأمر الأصلي لتشغيل البرنامج؟ (مثال: `python script.py input.txt`)
   - هل البرنامج سريع أم يحتاج وقت طويل؟
   - هل يجب أن يعمل في نافذة منفصلة؟

2. **أنشئ ملفين:**
   - `اسم_البرنامج.py` في مجلد `pythonapp/`
   - `اسم_البرنامج.bat` في مجلد `pythonapp/`

---

## 📝 قالب ملف BAT

```batch
@echo off
chcp 65001 > nul
python "%~dp0اسم_البرنامج.py" %*
```

**قواعد:**
- `%1` → إذا كان مدخل واحد فقط (رابط، ملف، كلمة)
- `%*` → إذا كان نص طويل أو عدة كلمات
- `%1 %2 %3` → إذا كانت أوامر محددة ومنفصلة

---

## 📝 قالب ملف Python

```python
import sys
import os

# المسار الحالي
script_dir = os.path.dirname(os.path.abspath(__file__))

# التحقق من المدخلات
if len(sys.argv) < 2:
    print("الاستخدام: pythonapp اسم_البرنامج <الأوامر>")
    sys.exit(1)

# معالجة الأوامر
def main():
    # إذا كان مدخل واحد:
    input_data = sys.argv[1]
    
    # إذا كان نص كامل:
    # input_data = " ".join(sys.argv[1:])
    
    try:
        # الكود الأصلي هنا
        result = process(input_data)
        print(result)
    except Exception as e:
        print(f"خطأ: {e}")

if __name__ == "__main__":
    main()
```

---

## ⚡ إذا كان البرنامج بطيء (نافذة منفصلة)

```python
import subprocess

def main():
    url = sys.argv[1]
    
    # فتح نافذة CMD جديدة
    subprocess.Popen(
        f'start cmd /k python "{script_dir}\\_worker.py" {url}',
        shell=True,
        creationflags=subprocess.CREATE_NEW_CONSOLE
    )
    
    print(f"تم بدء العملية في نافذة منفصلة")
```

---

## 🚫 ممنوعات

- ❌ لا تستخدم مسارات ثابتة مثل `C:/Users/...`
- ❌ لا تستخدم `input()` إلا في نوافذ منفصلة
- ❌ لا تنسى `chcp 65001 > nul` في BAT

---

## ✅ واجبات

- ✅ استخدم `script_dir = os.path.dirname(os.path.abspath(__file__))`
- ✅ احفظ النتائج في مجلد `pythonapp/`
- ✅ أضف `try-except` للأخطاء
- ✅ تحقق من `sys.argv` قبل الاستخدام

---

## 📌 مثال سريع

**المستخدم:** "اصنع bat لبرنامج يحول PNG إلى JPG"

**أنت:**
```
سأحتاج معلومات:
1. الأمر الأصلي؟
2. سريع أم بطيء؟
```

**المستخدم:** `python convert.py input.png output.jpg`

**أنت تنشئ:**

`convert.bat`:
```batch
@echo off
chcp 65001 > nul
python "%~dp0convert.py" %1 %2
```

`convert.py`:
```python
import sys
from PIL import Image

if len(sys.argv) < 3:
    print("الاستخدام: pythonapp convert <input.png> <output.jpg>")
    sys.exit(1)

input_file = sys.argv[1]
output_file = sys.argv[2]

try:
    img = Image.open(input_file)
    img.convert('RGB').save(output_file)
    print(f"تم التحويل: {output_file}")
except Exception as e:
    print(f"خطأ: {e}")
```

**الاستخدام:**
```
pythonapp convert photo.png photo.jpg
```

---

**ملخص:** اسأل → أنشئ .bat و .py → اختبر!
