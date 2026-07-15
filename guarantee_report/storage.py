"""
저장된 리포트 데이터 영속화 계층 (SQLite 기반).

DB_PATH 환경변수로 SQLite 파일 경로를 바꿀 수 있다. Render 무료 웹서비스처럼
디스크가 재배포/슬립-웨이크 시 초기화되는 환경에서는 이 파일 기반 저장이 영구
보존되지 않는다 — 실제 운영 환경에서는 Render의 유료 Persistent Disk를 켜거나,
이 모듈을 외부 DB(Postgres 등) 연동으로 교체하는 것을 권장한다. SQL 접점이 이
파일 하나로 모여 있어 백엔드를 바꿀 때 다른 코드는 건드릴 필요가 없다.
"""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "reports.db"))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    gender TEXT,
    birth_date TEXT,
    basis_date TEXT,
    created_at TEXT NOT NULL,
    monthly_premium INTEGER,
    ok_count INTEGER,
    warn_count INTEGER,
    gap_count INTEGER,
    total_contracts INTEGER,
    data_json TEXT NOT NULL
);
"""

_SUMMARY_COLS = """id, customer_name, gender, birth_date, basis_date, created_at,
                    monthly_premium, ok_count, warn_count, gap_count, total_contracts"""


@contextmanager
def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with _connect() as conn:
        conn.execute(_SCHEMA)


def _to_int(value) -> int | None:
    if value is None:
        return None
    try:
        return int(str(value).replace(",", ""))
    except ValueError:
        return None


def save_report(data: dict) -> int:
    header = data["header"]
    kpis = data["kpis"]
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO reports
               (customer_name, gender, birth_date, basis_date, created_at,
                monthly_premium, ok_count, warn_count, gap_count, total_contracts, data_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                header["name"],
                header.get("gender"),
                header.get("birth_display"),
                header.get("basis_date_display"),
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
                _to_int(kpis.get("monthly_premium")),
                kpis.get("ok_count"),
                kpis.get("warn_count"),
                kpis.get("gap_count"),
                header.get("total_contracts"),
                json.dumps(data, ensure_ascii=False),
            ),
        )
        return cur.lastrowid


def list_reports() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(f"SELECT {_SUMMARY_COLS} FROM reports ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]


def get_report(report_id: int) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT data_json FROM reports WHERE id = ?", (report_id,)).fetchone()
        return json.loads(row["data_json"]) if row else None


def get_report_meta(report_id: int) -> dict | None:
    with _connect() as conn:
        row = conn.execute(f"SELECT {_SUMMARY_COLS} FROM reports WHERE id = ?", (report_id,)).fetchone()
        return dict(row) if row else None


def delete_report(report_id: int) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM reports WHERE id = ?", (report_id,))
