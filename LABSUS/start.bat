@echo off
rem ============================================================
rem  LABSUS launcher (G13, 2026-08-31)
rem  1) starts the Python engine on :8001   (skipped if already up)
rem  2) starts the no-cache web server on :714
rem  3) opens http://127.0.0.1:714/dwb-pro-fullchassis.html
rem  Note: 0714 = Chuantuo's birthday. Frontend auto-connects to
rem  the engine on load; without engine it falls back to built-in
rem  JS solver, so the page works either way.
rem ============================================================
setlocal
cd /d "%~dp0"

set "PY=python"
where python >nul 2>nul || set "PY=py"
rem fallback: PATH python may lack deps (managed env) - use the known system python
%PY% -c "import fastapi,uvicorn,numpy,scipy,pydantic" >nul 2>nul
if errorlevel 1 set "PY=C:\Users\zzy\AppData\Local\Programs\Python\Python313\python.exe"

rem -- 1) engine :8001 --
netstat -ano | findstr /C:":8001 " | findstr /I "LISTENING" >nul 2>nul
if errorlevel 1 (
  echo [LABSUS] starting engine on port 8001 ...
  start "LABSUS Engine 8001" /min /D "%~dp0engine" cmd /c "%PY% server.py"
) else (
  echo [LABSUS] engine already running on 8001
)

rem -- 2) frontend :714 --
netstat -ano | findstr /C:":714 " | findstr /I "LISTENING" >nul 2>nul
if errorlevel 1 (
  echo [LABSUS] starting web server on port 714 ...
  start "LABSUS Web 714" /min /D "%~dp0" cmd /c "%PY% scripts\serve_nocache.py --port 714"
) else (
  echo [LABSUS] web already running on 714
)

rem -- 3) open browser --
rem Give the engine a few seconds to import numpy/scipy and bind :8001
timeout /t 5 /nobreak >nul
start "" "http://127.0.0.1:714/dwb-pro-fullchassis.html"

endlocal
