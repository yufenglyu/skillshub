@echo off
setlocal EnableExtensions

set "DEST=%USERPROFILE%\.skillshub"
set "SRC=%~dp0..\resources\packaged-config"
if not exist "%SRC%\platform\" set "SRC=%~dp0resources\packaged-config"
if not exist "%SRC%\platform\" set "SRC=%~dp0packaged-config"
if not exist "%SRC%\platform\" exit /b 0

if not exist "%DEST%\" mkdir "%DEST%" >nul 2>&1
if not exist "%DEST%\library\" mkdir "%DEST%\library" >nul 2>&1

if not exist "%DEST%\platform\" (
  mkdir "%DEST%\platform" >nul 2>&1
  xcopy /E /I /Y /Q "%SRC%\platform\*" "%DEST%\platform\" >nul
)

if not exist "%DEST%\db.sqlite" if exist "%SRC%\db.sqlite" (
  copy /Y "%SRC%\db.sqlite" "%DEST%\db.sqlite" >nul
)

if exist "%SRC%\library\.keep" if not exist "%DEST%\library\.keep" (
  copy /Y "%SRC%\library\.keep" "%DEST%\library\.keep" >nul
)

exit /b 0
