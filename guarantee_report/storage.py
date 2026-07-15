"""
저장된 리포트 · 사용자 데이터 영속화 계층.

DATABASE_URL 환경변수가 설정되어 있으면 Postgres를 사용하고(권장 — 예: Neon,
Supabase의 무료 Postgres), 없으면 로컬 SQLite 파일(DB_PATH, 기본값
guarantee_report/reports.db)을 사용한다. Render 무료 웹서비스처럼 디스크가
재배포/슬립-웨이크 시 초기화되는 환경에서는 SQLite 저장이 영구 보존되지
않으므로, 실제 운영 시에는 DATABASE_URL을 설정해 외부 Postgres를 쓰는 것을
권장한다. SQL 접점이 이 파일 하나로 모여 있어 백엔드 전환 시 다른 코드는
건드릴 필요가 없다.
"""
from __future__ import annotations

import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone

DATABASE_URL = os.environ.get("DATABASE_URL")
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "reports.db"))
BACKEND = "postgres" if DATABASE_URL else "sqlite"

_SCHEMA_POSTGRES = """
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL,
    last_login_at TEXT
);
"""

_SCHEMA_SQLITE = """
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
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL,
    last_login_at TEXT
);
"""

_SUMMARY_COLS = """id, customer_name, gender, birth_date, basis_date, created_at,
                    monthly_premium, ok_count, warn_count, gap_count, total_contracts,
                    created_by_user_id, created_by_name"""


def _q(sql: str) -> str:
    """SQLite 스타일(?) 플레이스홀더를 백엔드에 맞게 변환한다."""
    return sql.replace("?", "%s") if BACKEND == "postgres" else sql


@contextmanager
def _connect():
    if BACKEND == "postgres":
        import psycopg2
        import psycopg2.extras

        conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    else:
        import sqlite3

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _add_column_if_missing(cur, table: str, column: str, coltype: str) -> None:
    if BACKEND == "postgres":
        cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {coltype}")
        return
    try:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")
    except Exception:
        pass  # SQLite는 IF NOT EXISTS를 지원하지 않음 — 이미 있으면 무시


def init_db() -> None:
    with _connect() as conn:
        cur = conn.cursor()
        for stmt in (_SCHEMA_POSTGRES if BACKEND == "postgres" else _SCHEMA_SQLITE).split(";"):
            stmt = stmt.strip()
            if stmt:
                cur.execute(stmt)
        # 기존 배포에 리포트 소유자 컬럼 마이그레이션
        _add_column_if_missing(cur, "reports", "created_by_user_id", "INTEGER")
        _add_column_if_missing(cur, "reports", "created_by_name", "TEXT")
    global _initialized
    _initialized = True


_initialized = False


def _ensure_init() -> None:
    """DB가 시작 시점에 일시적으로 응답이 없었던 경우(예: Neon autosuspend 웨이크업 지연)에도
    실제 사용 시점에 한 번 더 초기화를 시도해, 앱 전체가 부팅 실패로 죽는 것을 막는다."""
    if not _initialized:
        init_db()


def _to_int(value) -> int | None:
    if value is None:
        return None
    try:
        return int(str(value).replace(",", ""))
    except ValueError:
        return None


# --- 사용자 ---


def upsert_user(name: str, phone: str, role: str) -> dict:
    """전화번호를 키로 사용자 정보를 갱신(또는 신규 생성)하고, 항상 최신 역할을 반영한다."""
    _ensure_init()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("SELECT id FROM users WHERE phone = ?"), (phone,))
        existing = cur.fetchone()
        if existing:
            user_id = existing["id"]
            cur.execute(
                _q("UPDATE users SET name = ?, role = ?, last_login_at = ? WHERE id = ?"),
                (name, role, now, user_id),
            )
        else:
            insert_sql = "INSERT INTO users (name, phone, role, created_at, last_login_at) VALUES (?,?,?,?,?)"
            if BACKEND == "postgres":
                cur.execute(_q(insert_sql) + " RETURNING id", (name, phone, role, now, now))
                user_id = cur.fetchone()["id"]
            else:
                cur.execute(insert_sql, (name, phone, role, now, now))
                user_id = cur.lastrowid
        return {"id": user_id, "name": name, "phone": phone, "role": role}


def list_users() -> list[dict]:
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, name, phone, role, created_at, last_login_at FROM users ORDER BY last_login_at DESC")
        return [dict(r) for r in cur.fetchall()]


# --- 리포트 ---


def save_report(data: dict, created_by_user_id: int | None = None, created_by_name: str | None = None) -> int:
    _ensure_init()
    header = data["header"]
    kpis = data["kpis"]
    params = (
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
        created_by_user_id,
        created_by_name,
    )
    insert_sql = """INSERT INTO reports
        (customer_name, gender, birth_date, basis_date, created_at,
         monthly_premium, ok_count, warn_count, gap_count, total_contracts, data_json,
         created_by_user_id, created_by_name)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"""
    with _connect() as conn:
        cur = conn.cursor()
        if BACKEND == "postgres":
            cur.execute(_q(insert_sql) + " RETURNING id", params)
            return cur.fetchone()["id"]
        cur.execute(insert_sql, params)
        return cur.lastrowid


def list_reports(created_by_user_id: int | None = None) -> list[dict]:
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        if created_by_user_id is None:
            cur.execute(f"SELECT {_SUMMARY_COLS} FROM reports ORDER BY created_at DESC")
        else:
            cur.execute(
                _q(f"SELECT {_SUMMARY_COLS} FROM reports WHERE created_by_user_id = ? ORDER BY created_at DESC"),
                (created_by_user_id,),
            )
        return [dict(r) for r in cur.fetchall()]


def get_report(report_id: int) -> dict | None:
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("SELECT data_json FROM reports WHERE id = ?"), (report_id,))
        row = cur.fetchone()
        return json.loads(row["data_json"]) if row else None


def get_report_meta(report_id: int) -> dict | None:
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q(f"SELECT {_SUMMARY_COLS} FROM reports WHERE id = ?"), (report_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def get_all_report_data() -> list[dict]:
    """관리자 통계용 — 모든 리포트의 전체 데이터(JSON)를 반환."""
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT data_json FROM reports ORDER BY created_at DESC")
        return [json.loads(r["data_json"]) for r in cur.fetchall()]


def delete_report(report_id: int) -> None:
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("DELETE FROM reports WHERE id = ?"), (report_id,))
