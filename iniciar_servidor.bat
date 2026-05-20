@echo off
title Servidor Todo Golosina - LOCAL
cd /d "%~dp0"

echo ======================================================
echo   INICIANDO SISTEMA DE FACTURACION LOCAL (OFFLINE)
echo ======================================================

echo [*] Activando entorno virtual local...
call venv\Scripts\activate

echo [*] Abriendo Facturador en Chrome...
start chrome "http://127.0.0.1:5000/facturador"

echo [*] Iniciando servidor Flask...
python app.py

pause