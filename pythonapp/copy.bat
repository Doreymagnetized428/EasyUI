@echo off
chcp 65001 > nul
python "%~dp0copy.py" %*
