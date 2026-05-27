"""
migrar_render.py — Script de migración independiente para PostgreSQL en Render.

Ejecutar UNA VEZ antes del despliegue (o como Build Command en Render):
    python migrar_render.py

Agrega las columnas faltantes a la tabla "Productos" sin interferir
con el arranque de Flask ni provocar deadlocks con SQLAlchemy.
"""

import os
import sys
import psycopg2

def migrar():
    database_url = os.environ.get("DATABASE_URL")

    if not database_url:
        print("[MIGRACIÓN] ✘ Variable DATABASE_URL no encontrada.")
        print("[MIGRACIÓN]   Asegúrate de que esté configurada en el entorno de Render.")
        sys.exit(1)

    # Render entrega 'postgres://' pero psycopg2 requiere 'postgresql://'
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    print(f"[MIGRACIÓN] Conectando a PostgreSQL...")

    conn = None
    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        conn.autocommit = True
        cursor = conn.cursor()

        # ── Columna: sincronizado ──────────────────────────────────────
        print("[MIGRACIÓN] Verificando columna 'sincronizado'...")
        cursor.execute(
            'ALTER TABLE "Productos" ADD COLUMN IF NOT EXISTS sincronizado BOOLEAN DEFAULT TRUE;'
        )
        print("[MIGRACIÓN] ✔ Columna 'sincronizado' lista.")

        # ── Columna: ultima_actualizacion ──────────────────────────────
        print("[MIGRACIÓN] Verificando columna 'ultima_actualizacion'...")
        cursor.execute(
            'ALTER TABLE "Productos" ADD COLUMN IF NOT EXISTS ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;'
        )
        print("[MIGRACIÓN] ✔ Columna 'ultima_actualizacion' lista.")

        cursor.close()
        print("")
        print("═" * 60)
        print("[RENDER] → Migración completada exitosamente.")
        print("           Estructura de base de datos actualizada.")
        print("═" * 60)

    except Exception as e:
        print(f"[MIGRACIÓN] ✘ Error durante la migración: {e}")
        sys.exit(1)

    finally:
        if conn:
            conn.close()
            print("[MIGRACIÓN] Conexión cerrada limpiamente.")

if __name__ == "__main__":
    migrar()
