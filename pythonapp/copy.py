#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
تطبيق copy - تخزين الرسائل في ملف نصي
"""
import sys
import os
from datetime import datetime

# إصلاح مشكلة الترميز في Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def save_message(message: str) -> bool:
    """حفظ الرسالة في ملف نصي"""
    
    if not message:
        print("الاستخدام: pythonapp copy <الرسالة>")
        return False
    
    try:
        # مسار المجلد الحالي
        script_dir = os.path.dirname(os.path.abspath(__file__))
        
        # إنشاء اسم ملف بالتاريخ والوقت
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"copy_{timestamp}.txt"
        filepath = os.path.join(script_dir, filename)
        
        # حفظ الرسالة
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(message)
        
        print(f"تم حفظ الرسالة في: {filename}")
        print(f"المسار: {filepath}")
        print(f"عدد الأحرف: {len(message)}")
        return True
        
    except Exception as e:
        print(f"خطأ: {e}")
        return False

if __name__ == "__main__":
    # محاولة قراءة من متغير البيئة أولاً (للنصوص الطويلة)
    env_input = os.environ.get("PYTHONAPP_INPUT", "")
    
    if len(sys.argv) >= 2:
        # دمج جميع الوسائط كرسالة واحدة
        message = " ".join(sys.argv[1:])
    elif env_input:
        message = env_input
    else:
        print("الاستخدام: pythonapp copy <الرسالة>")
        print('مثال: pythonapp copy "مرحبا بالعالم"')
        sys.exit(1)
    
    if save_message(message):
        sys.exit(0)
    else:
        sys.exit(1)
