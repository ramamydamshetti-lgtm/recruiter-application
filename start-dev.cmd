@echo off
REM =============================================================================
REM  DEV environment only — folder: Recruiter Application_Dev
REM  Does NOT use live ports 3000 / 8000 (leave live server running as-is).
REM
REM  UI (LAN):     http://192.168.1.168:3001
REM  API (local):  http://127.0.0.1:8001
REM  Database:     Recruiter_dev (PostgreSQL)
REM =============================================================================

set ROOT=%~dp0
cd /d "%ROOT%"

echo.
echo [1/2] Starting BACKEND on port 8001 ...
start "Recruiter DEV Backend (8001)" cmd /k "cd /d "%ROOT%backend" && npm run dev"

timeout /t 4 /nobreak >nul

echo [2/2] Starting FRONTEND on port 3001 (0.0.0.0 for LAN) ...
start "Recruiter DEV Frontend (3001)" cmd /k "cd /d "%ROOT%Staffing_Recruitment_Frontend" && npm run dev"

echo.
echo Done. Two console windows should open.
echo Open in browser: http://192.168.1.168:3001
echo (From this PC you can also use http://localhost:3001)
echo.
pause
