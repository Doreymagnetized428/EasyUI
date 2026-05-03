@echo off
chcp 65001 > nul
REM تشغيل برنامج توليد الصور الملونة
python "%~dp0colorgen.py" %1
