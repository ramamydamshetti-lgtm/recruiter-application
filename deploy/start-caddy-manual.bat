@echo off
cd /d "%~dp0"
net stop RecruiterApp-Caddy 2>nul
taskkill /F /IM caddy.exe 2>nul
timeout /t 2 /nobreak >nul
caddy run --config Caddyfile --adapter caddyfile --adapter caddyfile
