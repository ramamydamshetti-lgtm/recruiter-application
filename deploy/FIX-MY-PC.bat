@echo off
:: Run as Administrator on each company PC (right-click -> Run as administrator)
title Fix Recruiter App Access
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Right-click this file and choose "Run as administrator"
    pause
    exit /b 1
)

set IP=192.168.1.10
set HOSTS=%SystemRoot%\System32\drivers\etc\hosts

echo [1/4] Setting DNS to app server %IP% ...
powershell -NoProfile -Command "$a = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.Name -notmatch 'Loopback|vEthernet \(nat\)' } | Select-Object -First 1; if ($a) { Set-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ServerAddresses ('%IP%','192.168.1.1'); Write-Host '  OK' } else { Write-Host '  WARN: no adapter' }"

echo [2/4] Updating hosts file ...
findstr /C:"myapps.taskforge.com" %HOSTS% | findstr /C:"%IP%" >nul
if %errorlevel% neq 0 (
    echo.>> %HOSTS%
    echo # Recruiter Application>> %HOSTS%
    echo %IP%    myapps.taskforge.com>> %HOSTS%
    echo %IP%    www.myapps.taskforge.com>> %HOSTS%
)
echo   OK

echo [3/4] Bypassing proxy for internal addresses ...
powershell -NoProfile -Command "$k='HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'; $b=(Get-ItemProperty $k -Name ProxyOverride -EA SilentlyContinue).ProxyOverride; $n=@('%IP%','192.168.1.168','myapps.taskforge.com','*.taskforge.com','<local>')+@($b -split ';'|?{$_}); Set-ItemProperty $k ProxyOverride (($n|Select-Object -Unique)-join ';')"

ipconfig /flushdns >nul
echo   OK

echo [4/4] Testing server ...
powershell -NoProfile -Command "$t=Test-NetConnection %IP% -Port 80 -WarningAction SilentlyContinue; if($t.TcpTestSucceeded){'  OK - server reachable'}else{'  FAIL - not on office network?'}"

echo.
echo Opening http://myapps.taskforge.com
start "" "http://myapps.taskforge.com"
echo If that fails, try: http://%IP%
echo.
pause
