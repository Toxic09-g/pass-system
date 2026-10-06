@echo off
rem Запуск бюро пропусков: backend и frontend в отдельных окнах.
rem Закрыть окно - остановить сервер. Уже работающий сервер повторно не запускается.
rem Backend и frontend сами перезапускаются при изменении файлов проекта.
rem Файл хранится в кодировке CP866 (кодировка консоли Windows) - иначе cmd ломает кириллицу.
cd /d "%~dp0"

set BACKEND_PORT=3001
for /f "tokens=2 delims==" %%p in ('findstr /b "PORT=" backend\.env 2^>nul') do set BACKEND_PORT=%%p

netstat -ano | findstr /r /c:":%BACKEND_PORT% .*LISTENING" >nul
if errorlevel 1 (
  echo Запуск backend на порту %BACKEND_PORT%...
  start "Бюро пропусков - backend" /d "%~dp0backend" cmd /k npm run dev
) else (
  echo Backend уже работает на порту %BACKEND_PORT%.
)

netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if errorlevel 1 (
  echo Запуск frontend на порту 5173...
  start "Бюро пропусков - frontend" /d "%~dp0frontend" cmd /k npm run dev
) else (
  echo Frontend уже работает на порту 5173.
)

echo.
echo Адрес для этого компьютера:  http://localhost:5173
echo Адреса для локальной сети:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do for /f "tokens=*" %%b in ("%%a") do echo    http://%%b:5173
timeout /t 15
