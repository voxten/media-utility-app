@echo off
title Media Studio - Build & Installer Wizard
cd /d "%~dp0"

echo ========================================================
echo       MEDIA STUDIO - WINDOWS INSTALLER WIZARD
echo ========================================================
echo.

if exist ".venv\Scripts\python.exe" (
    set PYTHON_CMD=.venv\Scripts\python.exe
) else if exist "venv\Scripts\python.exe" (
    set PYTHON_CMD=venv\Scripts\python.exe
) else (
    where python >nul 2>nul
    if %errorlevel% neq 0 (
        where py >nul 2>nul
        if %errorlevel% neq 0 (
            echo [ERROR] Python interpreter not found on this system!
            echo Please install Python 3.12+ and try again.
            pause
            exit /b 1
        ) else (
            set PYTHON_CMD=py
        )
    ) else (
        set PYTHON_CMD=python
    )
)

%PYTHON_CMD% scripts\build_wizard.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] An error occurred during the build process.
    pause
    exit /b %errorlevel%
)
