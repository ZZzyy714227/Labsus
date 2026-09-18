@echo off
rem ============================================================
rem  LABSUS launcher (G13, 2026-08-31)
rem  1) starts the Python engine on :8001   (skipped if already up)
rem  2) starts the no-cache web server on :714
rem  3) opens http://127.0.0.1:714/dwb-pro-v4.html
rem  Note: 0714 = Chuantuo's birthday. Frontend auto-connects to
rem  the engine on load; without engine it falls back to built-in
rem  JS solver, so the page works either way.
rem ============================================================
setlocal
cd /d "%~dp0"

set "PY="

rem -- 1. Check local virtual environments (.venv / venv) --
if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" -c "import fastapi,uvicorn,numpy,scipy,pydantic" >nul 2>nul
  if not errorlevel 1 set "PY=%~dp0.venv\Scripts\python.exe"
)
if not defined PY if exist "%~dp0venv\Scripts\python.exe" (
  "%~dp0venv\Scripts\python.exe" -c "import fastapi,uvicorn,numpy,scipy,pydantic" >nul 2>nul
  if not errorlevel 1 set "PY=%~dp0venv\Scripts\python.exe"
)

rem -- 2. Check PATH python / py --
if not defined PY (
  python -c "import fastapi,uvicorn,numpy,scipy,pydantic" >nul 2>nul
  if not errorlevel 1 set "PY=python"
)
if not defined PY (
  py -c "import fastapi,uvicorn,numpy,scipy,pydantic" >nul 2>nul
  if not errorlevel 1 set "PY=py"
)

rem -- 3. Check Windows per-user Python installation in LOCALAPPDATA --
if not defined PY if defined LOCALAPPDATA (
  if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
  if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
  if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
  if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
)

rem -- 4. Fallback if dependencies not met --
if not defined PY (
  where python >nul 2>nul && set "PY=python"
  if not defined PY where py >nul 2>nul && set "PY=py"
  echo [LABSUS WARNING] Python environment may lack required dependencies.
  echo Please run: pip install -r requirements.txt
)

if not defined PY (
  echo [LABSUS ERROR] Python not found. Please install Python 3.10+ and add to PATH.
  pause
  exit /b 1
)

rem -- 1) engine :8001 --
%PY% -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/api/v3/health', timeout=1)" >nul 2>nul
if errorlevel 1 (
  echo [LABSUS] starting engine on port 8001 ...
  start "LABSUS Engine 8001" /min /D "%~dp0engine" cmd /c "%PY% server.py"
) else (
  echo [LABSUS] engine already running on 8001
)

rem -- 2) frontend :714 --
%PY% -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:714/dwb-pro-v4.html', timeout=1)" >nul 2>nul
if errorlevel 1 (
  echo [LABSUS] starting web server on port 714 ...
  start "LABSUS Web 714" /min /D "%~dp0" cmd /c "%PY% scripts\serve_nocache.py --port 714"
) else (
  echo [LABSUS] web already running on 714
)

rem -- 3) open browser --
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:714/dwb-pro-v4.html"

endlocal
