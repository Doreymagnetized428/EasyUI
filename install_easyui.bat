@echo off
setlocal

cd /d "%~dp0"

echo ==========================================
echo EasyUI installer (Windows)
echo ==========================================
echo.

set "PY_EXE="
where py >nul 2>&1
if %errorlevel%==0 (
  set "PY_EXE=py -3"
) else (
  where python >nul 2>&1
  if %errorlevel%==0 (
    set "PY_EXE=python"
  )
)

if "%PY_EXE%"=="" (
  echo ERROR: Python was not found in PATH.
  echo Install Python 3.10+ first, then run this script again.
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating virtual environment...
  %PY_EXE% -m venv .venv
  if errorlevel 1 (
    echo ERROR: Failed to create virtual environment.
    exit /b 1
  )
) else (
  echo Virtual environment already exists.
)

echo Activating virtual environment...
call ".venv\Scripts\activate.bat"
if errorlevel 1 (
  echo ERROR: Failed to activate virtual environment.
  exit /b 1
)

echo Upgrading pip...
python -m pip install --upgrade pip
if errorlevel 1 (
  echo ERROR: Failed to upgrade pip.
  exit /b 1
)

echo Installing Python packages from requirements.txt...
pip install -r requirements.txt
if errorlevel 1 (
  echo ERROR: Package installation failed.
  exit /b 1
)

echo Downloading required core model for intent classification...
python -c "from transformers import pipeline, AutoTokenizer; m='microsoft/Multilingual-MiniLM-L12-H384'; tok=AutoTokenizer.from_pretrained(m, use_fast=False); pipeline('zero-shot-classification', model=m, tokenizer=tok); print('Core intent model downloaded successfully.')"
if errorlevel 1 (
  echo ERROR: Failed to download the required intent classification model.
  echo The app depends on this model. Please fix internet/HuggingFace access and retry.
  exit /b 1
)

echo.
choice /C YN /N /M "Do you want to enable Arabic translation and download its models now? (Y/N): "
if errorlevel 2 goto :skip_arabic

echo Writing .easyui.env with Arabic translation enabled...
> ".easyui.env" echo EASYUI_ENABLE_AR_TRANSLATION=1

echo Downloading Arabic translation models (this may take a while)...
python -c "from transformers import AutoTokenizer, AutoModelForSeq2SeqLM; m1='Helsinki-NLP/opus-mt-ar-en'; m2='Helsinki-NLP/opus-mt-en-ar'; AutoTokenizer.from_pretrained(m1, use_fast=False); AutoModelForSeq2SeqLM.from_pretrained(m1); AutoTokenizer.from_pretrained(m2, use_fast=False); AutoModelForSeq2SeqLM.from_pretrained(m2); print('Arabic translation models downloaded successfully.')"
if errorlevel 1 (
  echo WARNING: Arabic model download failed. You can retry later.
  echo Core features are installed, but Arabic translation may not work until models are downloaded.
)
goto :end_arabic

:skip_arabic
echo Writing .easyui.env with Arabic translation disabled...
> ".easyui.env" echo EASYUI_ENABLE_AR_TRANSLATION=0
echo Arabic translation is disabled. The app will run without Arabic model loading.

:end_arabic

echo.
echo Setup completed.
echo.
pause
exit /b 0
