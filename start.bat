@echo off
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 goto use_py
where python >nul 2>nul
if not errorlevel 1 goto use_python
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" goto use_bundled
echo Python was not found. Install Python 3, then run this file again.
pause
exit /b 1

:use_py
py serve.py
goto end

:use_python
python serve.py
goto end

:use_bundled
"%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" serve.py

:end
