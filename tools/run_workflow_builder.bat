@echo off
setlocal
cd /d "%~dp0.."
python tools\workflow_intent_requirements_builder.py
endlocal
