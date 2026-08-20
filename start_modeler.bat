@echo off
setlocal
cd /d "%~dp0"
title V1 FSAE Suspension Modeler

echo ================================================================
echo    V1 FSAE Suspension Modeler   (press Ctrl+C to stop)
echo    Browser will open at:  http://127.0.0.1:8000/
echo    Make sure no other program is using port 8000.
echo ================================================================

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [ERROR] python not found. Install Python 3.10+ with "Add to PATH".
  pause
  exit /b 1
)

python -c "import fastapi, uvicorn" >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [INFO] dependencies missing, installing requirements.txt ...
  python -m pip install -r requirements.txt
)

echo.
echo   Starting server, opening browser in 3s ...
start "" cmd /c "timeout /t 3 /nobreak >nul & start "" http://127.0.0.1:8000/""

python run.py

echo   [server stopped]
pause
