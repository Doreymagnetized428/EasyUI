
# -*- coding: utf-8 -*-
"""
الملف الرئيسي الخفيف (EasyUi).
يبقى الاسم app.py ويستدعي التطبيق من app_core.py.
"""
import uvicorn
from app_core import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
