@echo off
cd /d "%~dp0"

REM activate venv
call .venv\Scripts\activate.bat

REM single window: run uvicorn only
python -m uvicorn app:app --host 0.0.0.0 --port 50030 
pause