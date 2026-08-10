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
import secrets
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta

DATABASE_URL = os.environ.get("DATABASE_URL")
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "reports.db"))
BACKEND = "postgres" if DATABASE_URL else "sqlite"


def hash_password(password: str) -> str:
    """비밀번호를 해시처리한다."""
    from werkzeug.security import generate_password_hash
    return generate_password_hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    """비밀번호 해시를 검증한다."""
    if not password_hash or not isinstance(password_hash, str):
        return False
    from werkzeug.security import check_password_hash
    try:
        return check_password_hash(password_hash, password)
    except Exception:
        return False

_SCHEMA_POSTGRES = """
CREATE TABLE IF NOT EXISTS guarantee_reports (
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
    data_json TEXT NOT NULL,
    source_file_name TEXT,
    source_file_path TEXT,
    notes TEXT
);
CREATE TABLE IF NOT EXISTS guarantee_users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL,
    last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS report_feedback (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by_user_id INTEGER,
    FOREIGN KEY (report_id) REFERENCES guarantee_reports(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES guarantee_users(id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by_user_id) REFERENCES guarantee_users(id) ON DELETE SET NULL
);
"""

_SCHEMA_SQLITE = """
CREATE TABLE IF NOT EXISTS guarantee_reports (
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
    data_json TEXT NOT NULL,
    source_file_name TEXT,
    source_file_path TEXT,
    notes TEXT
);
CREATE TABLE IF NOT EXISTS guarantee_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL,
    last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS report_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by_user_id INTEGER,
    FOREIGN KEY (report_id) REFERENCES guarantee_reports(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES guarantee_users(id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by_user_id) REFERENCES guarantee_users(id) ON DELETE SET NULL
);
"""

_SUMMARY_COLS = """id, customer_name, gender, birth_date, age, basis_date, created_at,
                    monthly_premium, ok_count, warn_count, gap_count, total_contracts,
                    created_by_user_id, created_by_name, share_token, notes"""


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
        # 기존 배포에 리포트 소유자 · 공유 링크 컬럼 마이그레이션
        _add_column_if_missing(cur, "guarantee_reports", "created_by_user_id", "INTEGER")
        _add_column_if_missing(cur, "guarantee_reports", "created_by_name", "TEXT")
        _add_column_if_missing(cur, "guarantee_reports", "share_token", "TEXT")
        _add_column_if_missing(cur, "guarantee_reports", "age", "INTEGER")
        # 원본 파일 저장 컬럼 추가
        _add_column_if_missing(cur, "guarantee_reports", "source_file_name", "TEXT")
        _add_column_if_missing(cur, "guarantee_reports", "source_file_path", "TEXT")
        # 사용자 비밀번호 컬럼 추가
        _add_column_if_missing(cur, "guarantee_users", "password_hash", "TEXT")
        # 리포트 수정사항 컬럼 추가
        _add_column_if_missing(cur, "guarantee_reports", "notes", "TEXT")
        # 피드백 반영 완료 여부 컬럼 추가
        _add_column_if_missing(cur, "report_feedback", "resolved_at", "TEXT")
        _add_column_if_missing(cur, "report_feedback", "resolved_by_user_id", "INTEGER")
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


def upsert_user(name: str, phone: str, role: str, password: str | None = None) -> dict:
    """전화번호를 키로 사용자 정보를 갱신(또는 신규 생성)하고, 항상 최신 역할을 반영한다."""
    _ensure_init()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("SELECT id, password_hash FROM guarantee_users WHERE phone = ?"), (phone,))
        existing = cur.fetchone()
        if existing:
            user_id = existing["id"]
            # 기존 사용자: 비밀번호는 유지하고 이름/역할만 업데이트
            password_hash = existing["password_hash"]
            cur.execute(
                _q("UPDATE guarantee_users SET name = ?, role = ?, last_login_at = ? WHERE id = ?"),
                (name, role, now, user_id),
            )
        else:
            # 신규 사용자: 비밀번호 해시 저장
            password_hash = hash_password(password) if password else None
            insert_sql = "INSERT INTO guarantee_users (name, phone, password_hash, role, created_at, last_login_at) VALUES (?,?,?,?,?,?)"
            if BACKEND == "postgres":
                cur.execute(_q(insert_sql) + " RETURNING id", (name, phone, password_hash, role, now, now))
                user_id = cur.fetchone()["id"]
            else:
                cur.execute(insert_sql, (name, phone, password_hash, role, now, now))
                user_id = cur.lastrowid
        return {"id": user_id, "name": name, "phone": phone, "role": role}


def get_user_by_phone(phone: str) -> dict | None:
    """휴대폰번호로 사용자를 조회한다."""
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("SELECT id, name, phone, password_hash, role FROM guarantee_users WHERE phone = ?"), (phone,))
        row = cur.fetchone()
        return dict(row) if row else None


def list_users() -> list[dict]:
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, name, phone, role, created_at, last_login_at FROM guarantee_users ORDER BY last_login_at DESC"
        )
        return [dict(r) for r in cur.fetchall()]


# --- 리포트 ---


def save_report(data: dict, created_by_user_id: int | None = None, created_by_name: str | None = None, source_file_name: str | None = None, source_file_path: str | None = None) -> int:
    _ensure_init()
    header = data["header"]
    kpis = data["kpis"]
    params = (
        header["name"],
        header.get("gender"),
        header.get("birth_display"),
        header.get("age"),
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
        source_file_name,
        source_file_path,
    )
    insert_sql = """INSERT INTO guarantee_reports
        (customer_name, gender, birth_date, age, basis_date, created_at,
         monthly_premium, ok_count, warn_count, gap_count, total_contracts, data_json,
         created_by_user_id, created_by_name, source_file_name, source_file_path)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"""
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
            query = _q(f"""
                SELECT {_SUMMARY_COLS},
                       COALESCE((SELECT COUNT(*) FROM report_feedback WHERE report_feedback.report_id = guarantee_reports.id), 0) as feedback_count,
                       COALESCE((SELECT COUNT(*) FROM report_feedback WHERE report_feedback.report_id = guarantee_reports.id AND report_feedback.resolved_at IS NOT NULL), 0) as feedback_resolved_count,
                       (SELECT content FROM report_feedback WHERE report_feedback.report_id = guarantee_reports.id ORDER BY created_at DESC LIMIT 1) as latest_feedback
                FROM guarantee_reports
                ORDER BY created_at DESC
            """)
            cur.execute(query)
        else:
            query = _q(f"""
                SELECT {_SUMMARY_COLS},
                       COALESCE((SELECT COUNT(*) FROM report_feedback WHERE report_feedback.report_id = guarantee_reports.id), 0) as feedback_count,
                       COALESCE((SELECT COUNT(*) FROM report_feedback WHERE report_feedback.report_id = guarantee_reports.id AND report_feedback.resolved_at IS NOT NULL), 0) as feedback_resolved_count,
                       (SELECT content FROM report_feedback WHERE report_feedback.report_id = guarantee_reports.id ORDER BY created_at DESC LIMIT 1) as latest_feedback
                FROM guarantee_reports
                WHERE created_by_user_id = ?
                ORDER BY created_at DESC
            """)
            cur.execute(query, (created_by_user_id,))
        return [dict(r) for r in cur.fetchall()]


def get_report(report_id: int, user_id: int | None = None) -> dict | None:
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        if user_id is not None:
            cur.execute(_q("SELECT data_json FROM guarantee_reports WHERE id = ? AND created_by_user_id = ?"), (report_id, user_id))
        else:
            cur.execute(_q("SELECT data_json FROM guarantee_reports WHERE id = ?"), (report_id,))
        row = cur.fetchone()
        if not row:
            return None
        try:
            return json.loads(row["data_json"])
        except (json.JSONDecodeError, ValueError):
            return None


def get_report_meta(report_id: int, user_id: int | None = None) -> dict | None:
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        if user_id is not None:
            cur.execute(_q(f"SELECT {_SUMMARY_COLS} FROM guarantee_reports WHERE id = ? AND created_by_user_id = ?"), (report_id, user_id))
        else:
            cur.execute(_q(f"SELECT {_SUMMARY_COLS} FROM guarantee_reports WHERE id = ?"), (report_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def get_all_report_data() -> list[dict]:
    """관리자 통계용 — 모든 리포트의 전체 데이터(JSON)를 반환."""
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT data_json FROM guarantee_reports ORDER BY created_at DESC")
        results = []
        for r in cur.fetchall():
            try:
                results.append(json.loads(r["data_json"]))
            except (json.JSONDecodeError, ValueError):
                continue  # 손상된 JSON은 건너뛰기
        return results


def delete_report(report_id: int) -> None:
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("DELETE FROM guarantee_reports WHERE id = ?"), (report_id,))


def get_or_create_share_token(report_id: int) -> str:
    """기존 공유 링크가 있으면 그대로 재사용하고, 없으면 새로 발급한다."""
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("SELECT share_token FROM guarantee_reports WHERE id = ?"), (report_id,))
        row = cur.fetchone()
        if row and row["share_token"]:
            return row["share_token"]
    return regenerate_share_token(report_id)


def regenerate_share_token(report_id: int) -> str:
    """리포트에 새 공유 토큰을 발급(또는 재발급)하고 반환한다. 기존 링크는 즉시 무효화된다."""
    _ensure_init()
    token = secrets.token_urlsafe(20)
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("UPDATE guarantee_reports SET share_token = ? WHERE id = ?"), (token, report_id))
    return token


def revoke_share_token(report_id: int) -> None:
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("UPDATE guarantee_reports SET share_token = NULL WHERE id = ?"), (report_id,))


def get_report_by_share_token(token: str) -> dict | None:
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("SELECT data_json FROM guarantee_reports WHERE share_token = ?"), (token,))
        row = cur.fetchone()
        if not row:
            return None
        try:
            return json.loads(row["data_json"])
        except (json.JSONDecodeError, ValueError):
            return None


def get_owner_phone_for_token(token: str) -> str | None:
    """공유 링크(token)로 리포트를 생성한 담당자(분석자)의 휴대폰번호를 조회한다.
    카카오톡 등으로 공유된 링크를 열 때, 이 번호를 입력해야 리포트를 볼 수 있게 하는
    간단한 접근 게이트에 사용된다."""
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            _q(
                """SELECT u.phone AS phone FROM guarantee_reports r
                   JOIN guarantee_users u ON u.id = r.created_by_user_id
                   WHERE r.share_token = ?"""
            ),
            (token,),
        )
        row = cur.fetchone()
        return row["phone"] if row else None


def get_source_file(report_id: int, user_id: int | None = None) -> tuple[str, str] | None:
    """원본 파일명과 파일 경로를 반환한다. (user_id 검증 포함)"""
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        if user_id is not None:
            cur.execute(_q("SELECT source_file_name, source_file_path FROM guarantee_reports WHERE id = ? AND created_by_user_id = ?"), (report_id, user_id))
        else:
            cur.execute(_q("SELECT source_file_name, source_file_path FROM guarantee_reports WHERE id = ?"), (report_id,))
        row = cur.fetchone()
        if not row:
            return None
        return (row["source_file_name"], row["source_file_path"])


def save_notes(report_id: int, notes: str) -> None:
    """리포트 수정사항을 저장한다."""
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("UPDATE guarantee_reports SET notes = ? WHERE id = ?"), (notes, report_id))


def get_notes(report_id: int) -> str | None:
    """리포트 수정사항을 조회한다."""
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("SELECT notes FROM guarantee_reports WHERE id = ?"), (report_id,))
        row = cur.fetchone()
        return row["notes"] if row else None


def clear_all_data() -> None:
    """모든 사용자와 리포트 삭제 (관리자 초기화용)."""
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("DELETE FROM guarantee_reports"))
        cur.execute(_q("DELETE FROM guarantee_users"))


def update_user_activity(user_id: int, action: str | None = None) -> None:
    """사용자의 마지막 활동 시간을 업데이트한다."""
    _ensure_init()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("UPDATE guarantee_users SET last_login_at = ? WHERE id = ?"), (now, user_id))


def list_active_users(minutes: int = 10) -> list[dict]:
    """최근 N분 이내에 활동한 사용자 목록을 반환한다."""
    _ensure_init()
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(minutes=minutes)).isoformat(timespec="seconds")
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            _q("SELECT id, name, phone, role, created_at, last_login_at FROM guarantee_users WHERE last_login_at > ? ORDER BY last_login_at DESC"),
            (cutoff,),
        )
        return [dict(r) for r in cur.fetchall()]


# --- 피드백 ---


def save_feedback(report_id: int, user_id: int, content: str) -> int:
    """리포트에 피드백을 추가한다."""
    _ensure_init()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    insert_sql = "INSERT INTO report_feedback (report_id, user_id, content, created_at, updated_at) VALUES (?,?,?,?,?)"
    with _connect() as conn:
        cur = conn.cursor()
        if BACKEND == "postgres":
            cur.execute(_q(insert_sql) + " RETURNING id", (report_id, user_id, content, now, now))
            return cur.fetchone()["id"]
        cur.execute(insert_sql, (report_id, user_id, content, now, now))
        return cur.lastrowid


def get_report_feedback(report_id: int) -> list[dict]:
    """리포트의 모든 피드백을 조회한다."""
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            _q("""SELECT f.id, f.report_id, f.user_id, f.content, f.created_at, f.updated_at,
                          f.resolved_at, f.resolved_by_user_id,
                          u.name AS user_name,
                          u2.name AS resolved_by_user_name
                   FROM report_feedback f
                   LEFT JOIN guarantee_users u ON f.user_id = u.id
                   LEFT JOIN guarantee_users u2 ON f.resolved_by_user_id = u2.id
                   WHERE f.report_id = ? ORDER BY f.created_at DESC"""),
            (report_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def update_feedback(feedback_id: int, content: str) -> None:
    """피드백 내용을 수정한다."""
    _ensure_init()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("UPDATE report_feedback SET content = ?, updated_at = ? WHERE id = ?"), (content, now, feedback_id))


def resolve_feedback(feedback_id: int, admin_user_id: int) -> None:
    """피드백 반영 완료 상태를 표시한다. (관리자만 가능)"""
    _ensure_init()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            _q("UPDATE report_feedback SET resolved_at = ?, resolved_by_user_id = ? WHERE id = ?"),
            (now, admin_user_id, feedback_id)
        )


def unresolve_feedback(feedback_id: int) -> None:
    """피드백 반영 완료 상태를 해제한다. (관리자만 가능)"""
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("UPDATE report_feedback SET resolved_at = NULL, resolved_by_user_id = NULL WHERE id = ?"), (feedback_id,))


def delete_feedback(feedback_id: int) -> None:
    """피드백을 삭제한다."""
    _ensure_init()
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(_q("DELETE FROM report_feedback WHERE id = ?"), (feedback_id,))
