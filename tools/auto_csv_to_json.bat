
@echo off
REM Auto-convert easy-tag\tags CSVs to JSON and delete CSVs
setlocal
set SCRIPT_DIR=%~dp0
set TAGS_DIR=%SCRIPT_DIR%\..\easy-tag\tags
python "%SCRIPT_DIR%\auto_csv_to_json.py" "%TAGS_DIR%"
if %ERRORLEVEL% NEQ 0 (
  echo Failed. Make sure Python is installed and PATH configured.
  pause
  exit /b 1
)
echo Conversion completed.
pause
