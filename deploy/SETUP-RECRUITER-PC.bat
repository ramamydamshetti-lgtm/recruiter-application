@echo off
title Recruiter Application Setup
echo.
echo  This will configure your PC to access the Recruiter Application.
echo  Right-click and "Run as administrator" if this fails.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-recruiter-pc.ps1"
pause
