@echo off
REM =============================================================================
REM  Do NOT type "d:\Recruiter Application>" — that is the prompt, not a command.
REM  Copy ONE of the lines below (whole line), paste into CMD, press Enter.
REM
REM    "d:\Recruiter Application\run-email-pipeline.bat" --limit 50 pipeline
REM
REM  Or: cd /d "d:\Recruiter Application"
REM       then type only:  email-pipeline.cmd --limit 50 pipeline
REM =============================================================================
cd /d "%~dp0"
call "%~dp0email-pipeline.cmd" %*
exit /b %ERRORLEVEL%
