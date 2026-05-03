#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
برنامج توليد صورة بلون محدد
الاستخدام: python colorgen.py <color_name>
"""
import sys
from PIL import Image
import os

# قاموس الألوان
COLORS = {
    'red': (255, 0, 0),
    'blue': (0, 0, 255),
    'green': (0, 255, 0),
    'yellow': (255, 255, 0),
    'orange': (255, 165, 0),
    'purple': (128, 0, 128),
    'pink': (255, 192, 203),
    'black': (0, 0, 0),
    'white': (255, 255, 255),
    'gray': (128, 128, 128),
}

def generate_color_image(color_name, width=512, height=512):
    """توليد صورة بلون محدد"""
    color_name = color_name.lower().strip()
    
    if color_name not in COLORS:
        print(f"❌ اللون '{color_name}' غير مدعوم")
        print(f"الألوان المدعومة: {', '.join(COLORS.keys())}")
        return False
    
    # الحصول على RGB
    rgb = COLORS[color_name]
    
    # إنشاء الصورة
    img = Image.new('RGB', (width, height), rgb)
    
    # حفظ الصورة في نفس المجلد
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, f"{color_name}_image.png")
    
    img.save(output_path)
    print(f"✅ تم إنشاء الصورة: {output_path}")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("❌ الاستخدام: python colorgen.py <color_name>")
        print(f"الألوان المتاحة: {', '.join(COLORS.keys())}")
        sys.exit(1)
    
    color = sys.argv[1]
    success = generate_color_image(color)
    sys.exit(0 if success else 1)
