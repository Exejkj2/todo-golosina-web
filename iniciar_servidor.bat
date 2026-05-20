@echo off
title Servidor Todo Golosina - LOCAL
echo ======================================================
echo   INICIANDO SISTEMA DE FACTURACION LOCAL (OFFLINE)
echo ======================================================
cd /d "%~dp0"

if not exist venv (
    echo [!] Entorno virtual no detectado. Por favor, crea uno con: python -m venv venv
    pause
    exit
)

echo [*] Abriendo Facturador en el navegador...
start http://127.0.0.1:5000/facturador

echo [*] Iniciando servidor Flask...
call venv\Scripts\activate
python app.py
pause