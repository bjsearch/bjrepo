"""
보장분석 PDF 업로드 → HTML 리포트 생성 웹 앱.

주의: 업로드되는 PDF에는 이름 · 주민등록번호 일부 · 보험 가입내역 등 민감한 개인(신용)정보가
포함됩니다. 업로드된 파일은 처리 즉시 메모리에서만 다루고 디스크에 영구 저장하지 않으며,
요청 종료 시 임시 파일을 삭제합니다.

인증: 이름 + 휴대폰번호로 로그인합니다 (세션 쿠키). ADMIN_PHONES 환경변수에 등록된
휴대폰번호로 로그인하면 관리자 권한(모든 사용자의 리포트 조회 · 통계)을 받습니다.
APP_PASSWORD를 설정하면 로그인 화면에 팀 공용 비밀번호 입력칸이 추가로 표시되어,
비밀번호를 모르는 외부인은 로그인 자체를 시도할 수 없습니다.
"""
from __future__ import annotations

import hmac
import os
import re
import secrets
import subprocess
import tempfile
import time
from collections import Counter
from functools import wraps
from pathlib import Path
from urllib.parse import quote

from flask import Flask, request, render_template, Response, redirect, url_for, abort, session, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import secure_filename

from . import chatbot, storage
from .builder import build_report_data
from .compare import build_comparison
from .parser import ReportParseError, parse_pdf
from .excel_parser import parse_excel as parse_excel_file
from .render import render_html, render_template
from .pdf_utils import compress_pdf, should_compress

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20MB
# Render(및 대부분의 PaaS)는 앱 앞단에 리버스 프록시를 두므로, 프록시가 보내는
# X-Forwarded-* 헤더를 신뢰하도록 설정해야 url_for(_external=True)가 내부 바인드
# 주소(예: 127.0.0.1:10000)가 아닌 실제 공개 도메인/https를 반환한다.
# (그렇지 않으면 카카오톡 등으로 공유한 링크의 호스트가 잘못되어 열리지 않는다.)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)

# 요청 타임아웃 설정 (Render 무료에서 장시간 요청 처리)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0  # 캐시 비활성화 (개발)
if os.environ.get("RENDER"):
    # Render 환경에서 추가 설정
    app.config["JSON_SORT_KEYS"] = False

# 업로드된 원본 파일 저장 디렉토리 (메모리 절감용 파일 시스템 저장)
UPLOAD_DIR = Path(tempfile.gettempdir()) / "guarantee_report_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
try:
    storage.init_db()
except Exception as e:  # noqa: BLE001 — DB가 기동 시점에 잠깐 응답 없어도 앱 자체는 떠야 함
    print(
        f"[경고] 시작 시 DB 초기화에 실패했습니다 (DB가 깨어나는 중이면 곧 자동 복구됩니다): {e}",
        flush=True,
    )

TEAM_PASSWORD = os.environ.get("APP_PASSWORD")
ADMIN_PHONES = {re.sub(r"\D", "", p) for p in os.environ.get("ADMIN_PHONES", "").split(",") if p.strip()}
# 승인자 목록 (관리자만 신규 가입자를 승인할 수 있음)
APPROVER_PHONES = {re.sub(r"\D", "", p) for p in os.environ.get("APPROVER_PHONES", "").split(",") if p.strip()}
KAKAO_JS_KEY = os.environ.get("KAKAO_JS_KEY")  # 설정 시 카카오톡 공유가 SDK 카드 형태로 동작 (없으면 웹 공유/링크복사로 대체)

_secret = os.environ.get("SECRET_KEY")
if not _secret:
    _secret = secrets.token_hex(32)
    print(
        "[경고] SECRET_KEY 환경변수가 없어 임시 키로 세션을 서명합니다. "
        "재배포/재시작마다 로그인이 풀립니다. 배포 시 SECRET_KEY를 설정하세요.",
        flush=True,
    )
app.secret_key = _secret
# 세션 보안 설정
app.config.update(
    SESSION_COOKIE_SECURE=True,  # HTTPS only
    SESSION_COOKIE_HTTPONLY=True,  # JavaScript 접근 불가
    SESSION_COOKIE_SAMESITE="Lax",  # CSRF 방지
    PERMANENT_SESSION_LIFETIME=3600,  # 1시간 타임아웃
)

# 임시 리포트 데이터 캐시 (UUID → 리포트 데이터)
_draft_reports = {}


def _generate_draft_id() -> str:
    """임시 리포트 ID 생성"""
    return secrets.token_urlsafe(16)


def _get_csrf_token() -> str:
    """세션에서 CSRF 토큰 가져오거나 생성"""
    if "_csrf_token" not in session:
        session["_csrf_token"] = secrets.token_urlsafe(32)
    return session["_csrf_token"]


def _check_csrf_token() -> bool:
    """POST 요청의 CSRF 토큰 검증"""
    token = request.form.get("_csrf_token", "")
    session_token = session.get("_csrf_token", "")
    return token and session_token and hmac.compare_digest(token, session_token)


def _get_upload_context(error=None, **extra) -> dict:
    """업로드 페이지 템플릿 컨텍스트 생성"""
    return {
        "error": error,
        "user": current_user(),
        "csrf_token": _get_csrf_token(),
        "logo_mark": LOGO_MARK,
        "nav_css": NAV_CSS,
        "icon_dashboard": ICON_DASHBOARD,
        "icon_doc": ICON_DOC,
        "icon_logout": ICON_LOGOUT,
        **extra,
    }


if not TEAM_PASSWORD:
    print(
        "[경고] APP_PASSWORD가 설정되지 않아 로그인 화면에 팀 비밀번호 확인이 없습니다. "
        "외부에 배포할 때는 반드시 설정하세요.",
        flush=True,
    )
if not ADMIN_PHONES:
    print("[안내] ADMIN_PHONES가 비어 있어 관리자 권한을 받는 사용자가 없습니다.", flush=True)


def _normalize_phone(p: str) -> str:
    return re.sub(r"\D", "", p or "")


def _mask_phone(phone: str) -> str:
    digits = phone or ""
    if len(digits) < 7:
        return digits or "-"
    return f"{digits[:3]}{'*' * (len(digits) - 7)}{digits[-4:]}"


def current_user() -> dict | None:
    return session.get("user")


_CHAT_RATE_LIMIT: dict[str, list[float]] = {}
_CHAT_RATE_MAX = 12  # 분당 최대 질문 수 (챗봇 API 비용 남용 방지)
_CHAT_RATE_WINDOW = 60.0


def _chat_rate_limited(key: str) -> bool:
    now = time.time()
    hits = [t for t in _CHAT_RATE_LIMIT.get(key, []) if now - t < _CHAT_RATE_WINDOW]
    hits.append(now)
    _CHAT_RATE_LIMIT[key] = hits
    return len(hits) > _CHAT_RATE_MAX


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user or user.get("role") != "admin":
            abort(403)
        return view(*args, **kwargs)

    return wrapper


@app.before_request
def _require_login():
    if request.endpoint in ("login", "signup", "logout", "static", "shared_report", "shared_report_chat"):
        return None
    user = current_user()
    if not user:
        return redirect(url_for("login", next=request.path))
    # 사용자 활동 시간 업데이트 (인증된 요청)
    try:
        storage.update_user_activity(user["id"])
    except Exception:
        pass  # 활동 추적 실패는 무시
    return None


NAV_CSS = """
  .navbar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px 14px;max-width:920px;margin:0 auto 8px;padding:0 20px;font-size:13px;color:var(--sub)}
  .navbar .brand-group{display:flex;align-items:center;gap:9px}
  .navbar .brand{display:flex;align-items:center;gap:7px;text-decoration:none;flex:none}
  .navbar .brand .wordmark{font-family:"Noto Serif KR",serif;font-weight:700;font-size:15.5px;color:var(--ink);letter-spacing:-.01em}
  .navbar .menu{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px}
  .navbar a,.navbar .who{white-space:nowrap}
  .navbar a{display:inline-flex;align-items:center;gap:5px;color:var(--sub);text-decoration:none;font-weight:600}
  .navbar a:hover{color:var(--ink)}
  .navbar a.admin{color:var(--ok)}
  .navbar a.admin:hover{color:var(--ink)}
  .navbar a svg{width:14px;height:14px;flex:none}
"""

LOGO_MARK = (
    '<svg viewBox="0 0 40 40" width="22" height="22" aria-hidden="true">'
    '<path d="M4 21 A16 15 0 0 1 36 21 Z" fill="#10233F"/>'
    '<rect x="9" y="21" width="4.4" height="6" rx="1.6" fill="#1D5BD8"/>'
    '<rect x="17.8" y="21" width="4.4" height="10" rx="1.6" fill="#1D5BD8"/>'
    '<rect x="26.6" y="21" width="4.4" height="14" rx="1.6" fill="#1D5BD8"/>'
    "</svg>"
)
ICON_DASHBOARD = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/>'
    '<rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>'
    '<rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>'
)
ICON_DOC = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/>'
    '<path d="M14 3v5h5"/></svg>'
)
ICON_LOGOUT = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>'
    '<polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
)
ICON_PLUS = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/>'
    '<line x1="5" y1="12" x2="19" y2="12"/></svg>'
)


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template(
            "login.html.j2", error=None, need_password=bool(TEAM_PASSWORD), next_url=request.args.get("next"), logo_mark=LOGO_MARK
        )

    name = request.form.get("name", "").strip()
    phone_raw = request.form.get("phone", "").strip()
    phone = _normalize_phone(phone_raw)
    team_password = request.form.get("team_password", "")
    user_password = request.form.get("password", "")
    next_url = request.form.get("next") or url_for("index")

    def _fail(msg, status=400):
        return (
            render_template(
                "login.html.j2",
                error=msg,
                need_password=bool(TEAM_PASSWORD),
                next_url=next_url,
                logo_mark=LOGO_MARK,
                user_name=name,
                user_phone=phone_raw,
            ),
            status,
        )

    if not name or len(phone) < 9:
        return _fail("이름과 휴대폰번호를 정확히 입력해주세요.")

    # 팀 비밀번호 검증 (설정되어 있으면)
    if TEAM_PASSWORD and not hmac.compare_digest(team_password, TEAM_PASSWORD):
        return _fail(
            "❌ 팀 비밀번호가 올바르지 않습니다.\n\n"
            "팀에서 공유받은 비밀번호를 다시 확인하고 입력해주세요.",
            401
        )

    # 비밀번호가 비어있으면 기본값 "000000" 사용
    if not user_password:
        user_password = "000000"

    role = "admin" if phone in ADMIN_PHONES else "user"
    try:
        # 기존 사용자 확인
        existing_user = storage.get_user_by_phone(phone)
        if existing_user:
            # 승인 상태 확인
            approval_status = existing_user.get("approval_status", "approved")
            if approval_status == "pending":
                return _fail(
                    "❌ 승인 대기 중입니다.\n\n"
                    "귀하의 계정이 관리자의 승인을 기다리고 있습니다.\n"
                    "승인되면 로그인할 수 있습니다.",
                    401
                )
            elif approval_status == "rejected":
                return _fail(
                    "❌ 가입이 거부되었습니다.\n\n"
                    "관리자가 귀하의 가입을 거부했습니다.\n"
                    "자세한 사항은 관리자에게 문의하세요.",
                    403
                )

            # 기존 사용자: 비밀번호 검증
            password_hash = existing_user.get("password_hash")
            if not storage.verify_password(user_password, password_hash):
                return _fail(
                    "❌ 비밀번호가 올바르지 않습니다.\n\n"
                    "입력하신 비밀번호를 다시 확인해주세요. 혹은 비밀번호를 변경하려면 "
                    "회원 가입 페이지에서 새로운 비밀번호로 등록할 수 있습니다.",
                    401
                )
            # 이름과 역할 업데이트
            user = storage.upsert_user(name, phone, role)
        else:
            # 신규 사용자: 계정 생성
            user = storage.upsert_user(name, phone, role, user_password)
    except Exception as e:  # noqa: BLE001 — DB 문제를 화면에 바로 보여줘 진단을 돕는다
        import traceback

        traceback.print_exc()
        return _fail(f"로그인 중 서버 오류가 발생했습니다 (DB 연결 문제일 수 있음): {e}", 500)
    session["user"] = {"id": user["id"], "name": user["name"], "role": user["role"]}
    return redirect(next_url)


@app.route("/logout", methods=["GET", "POST"])
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "GET":
        return render_template("signup.html.j2", error=None, logo_mark=LOGO_MARK)

    name = request.form.get("name", "").strip()
    phone_raw = request.form.get("phone", "").strip()
    phone = _normalize_phone(phone_raw)
    password = request.form.get("password", "")
    password_confirm = request.form.get("password_confirm", "")

    def _fail(msg, status=400):
        return (
            render_template(
                "signup.html.j2",
                error=msg,
                user_name=name,
                user_phone=phone_raw,
                logo_mark=LOGO_MARK,
            ),
            status,
        )

    if not name or len(phone) < 9:
        return _fail("❌ 입력 오류\n\n이름과 휴대폰번호를 모두 정확히 입력해주세요.")

    if not password or len(password) < 6:
        return _fail(
            "❌ 비밀번호 요건 미충족\n\n"
            "비밀번호는 6자 이상이어야 합니다. (예: abc1234)"
        )

    if password != password_confirm:
        return _fail(
            "❌ 비밀번호 불일치\n\n"
            "입력하신 두 비밀번호가 일치하지 않습니다. 다시 확인해주세요."
        )

    try:
        role = "admin" if phone in ADMIN_PHONES else "user"
        existing_user = storage.get_user_by_phone(phone)
        if existing_user:
            # 기존 사용자: 비밀번호만 검증하고 로그인
            if not storage.verify_password(password, existing_user.get("password_hash")):
                return _fail(
                    "❌ 계정 이미 존재\n\n"
                    f"이 휴대폰번호({_mask_phone(phone)})로 이미 등록된 계정이 있습니다.\n"
                    "로그인 페이지에서 해당 계정으로 로그인해주세요. "
                    "비밀번호를 잊으신 경우 로그인 후 비밀번호를 변경할 수 있습니다."
                )
            user = storage.upsert_user(name, phone, role)
        else:
            # 신규 사용자: 관리자면 approved, 일반 사용자면 pending 상태로 생성
            approval_status = "approved" if role == "admin" else "pending"
            user = storage.upsert_user(name, phone, role, password, approval_status=approval_status)

            # 신규 사용자가 pending 상태면 승인 대기 페이지로 이동
            if approval_status == "pending":
                return (
                    render_template(
                        "signup_pending.html.j2",
                        user_name=name,
                        logo_mark=LOGO_MARK,
                    ),
                    200,
                )

        session["user"] = {"id": user["id"], "name": user["name"], "role": user["role"]}
        return redirect(url_for("index"))
    except Exception as e:  # noqa: BLE001
        import traceback

        traceback.print_exc()
        return _fail(f"회원 가입 중 서버 오류가 발생했습니다: {e}", 500)


@app.route("/change-password", methods=["GET", "POST"])
def change_password():
    user = current_user()
    if not user:
        return redirect(url_for("login"))

    if request.method == "GET":
        html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="data:image/svg+xml,<svg%20xmlns='http%3A//www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'><path%20d='M4%2021%20A16%2015%200%200%201%2036%2021%20Z'%20fill='%2310233F'/><rect%20x='9'%20y='21'%20width='4.4'%20height='6'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='17.8'%20y='21'%20width='4.4'%20height='10'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='26.6'%20y='21'%20width='4.4'%20height='14'%20rx='1.6'%20fill='%231D5BD8'/></svg>">
<title>비밀번호 변경</title>
<style>
  :root{{--ink:#10233F;--paper:#F6F7F9;--card:#FFFFFF;--line:#E3E7EE;--sub:#5B6B82;--ok:#1D5BD8;--gap:#C93030}}
  *{{box-sizing:border-box}}
  body{{font-family:-apple-system,"Pretendard",sans-serif;background:var(--paper);color:var(--ink);margin:0;padding:64px 20px;line-height:1.6}}
  .wrap{{max-width:400px;margin:0 auto}}
  h1{{font-size:22px;margin-bottom:6px}}
  p.sub{{color:var(--sub);font-size:13.5px;margin-bottom:26px}}
  label{{display:block;font-size:13px;font-weight:700;margin:16px 0 6px}}
  input{{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:8px;font-size:15px;font-family:inherit;background:var(--card);color:var(--ink)}}
  input:focus{{outline:2px solid var(--ok);outline-offset:-1px}}
  button{{margin-top:24px;width:100%;padding:13px;border:none;border-radius:8px;background:var(--ink);color:#fff;font-size:15px;font-weight:600;cursor:pointer}}
  button:hover{{opacity:.9}}
  .err{{margin-top:16px;padding:12px 16px;background:#FBEDED;color:var(--gap);border-radius:8px;font-size:13.5px}}
  .success{{margin-top:16px;padding:12px 16px;background:#E8F5E9;color:#2E7D32;border-radius:8px;font-size:13.5px}}
  .back-link{{display:inline-block;margin-top:20px;font-size:13px;color:var(--ok);text-decoration:none;font-weight:600}}
  .back-link:hover{{text-decoration:underline}}
</style>
</head>
<body>
<div class="wrap">
  <h1>비밀번호 변경</h1>
  <p class="sub">{user["name"]}님의 비밀번호를 변경하세요.</p>
  {request.args.get("success") and '<div class="success">비밀번호가 성공적으로 변경되었습니다.</div>' or ''}
  {request.args.get("error") and f'<div class="err">{request.args.get("error")}</div>' or ''}
  <form method="post">
    <label for="current_password">현재 비밀번호</label>
    <input type="password" id="current_password" name="current_password" required>
    <label for="new_password">새 비밀번호</label>
    <input type="password" id="new_password" name="new_password" required placeholder="6자 이상">
    <label for="confirm_password">새 비밀번호 확인</label>
    <input type="password" id="confirm_password" name="confirm_password" required placeholder="새 비밀번호와 동일하게">
    <button type="submit">비밀번호 변경</button>
  </form>
  <a class="back-link" href="/reports">← 돌아가기</a>
</div>
</body>
</html>"""
        return html

    # POST: 비밀번호 변경 처리
    current_pwd = request.form.get("current_password", "")
    new_pwd = request.form.get("new_password", "")
    confirm_pwd = request.form.get("confirm_password", "")

    # DB에서 현재 사용자 정보 조회
    try:
        # user["id"]로 사용자 조회
        with storage._connect() as conn:
            cur = conn.cursor()
            cur.execute(storage._q("SELECT password_hash FROM guarantee_users WHERE id = ?"), (user["id"],))
            row = cur.fetchone()
            password_hash = row["password_hash"] if row else ""
    except Exception as e:
        return redirect(url_for("change_password", error="사용자 정보를 불러올 수 없습니다."))

    # 현재 비밀번호 검증
    if not current_pwd or not storage.verify_password(current_pwd, password_hash or ""):
        return redirect(url_for("change_password", error="현재 비밀번호가 올바르지 않습니다."))

    # 새 비밀번호 검증
    if not new_pwd or len(new_pwd) < 6:
        return redirect(url_for("change_password", error="새 비밀번호는 6자 이상이어야 합니다."))

    if new_pwd != confirm_pwd:
        return redirect(url_for("change_password", error="새 비밀번호가 일치하지 않습니다."))

    # 비밀번호 업데이트
    try:
        new_hash = storage.hash_password(new_pwd)
        with storage._connect() as conn:
            cur = conn.cursor()
            cur.execute(storage._q("UPDATE guarantee_users SET password_hash = ? WHERE id = ?"), (new_hash, user["id"]))
        return redirect(url_for("change_password", success="1"))
    except Exception as e:
        import traceback
        traceback.print_exc()
        return redirect(url_for("change_password", error=f"비밀번호 변경 중 오류가 발생했습니다"))


@app.get("/")
def index():
    return render_template("upload.html.j2", **_get_upload_context())


@app.post("/generate")
def generate():
    if not _check_csrf_token():
        abort(403)
    user = current_user()
    f = request.files.get("file")
    if not f or not f.filename:
        return render_template("upload.html.j2", **_get_upload_context(error="파일을 선택해주세요.")), 400

    filename_lower = f.filename.lower()
    is_pdf = filename_lower.endswith(".pdf")
    is_xlsx = filename_lower.endswith(".xlsx")

    if not (is_pdf or is_xlsx):
        return render_template("upload.html.j2", **_get_upload_context(error="PDF 또는 Excel 파일만 업로드할 수 있습니다.")), 400

    # 파일 크기 체크
    f.seek(0, 2)  # 파일 끝으로 이동
    file_size = f.tell()
    f.seek(0)  # 처음으로 리셋

    compress_needed = is_pdf and should_compress(file_size, threshold_mb=50)

    tmp_path = None
    compressed_path = None
    upload_file_path = None
    try:
        if is_pdf:
            fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
            with os.fdopen(fd, "wb") as tmp:
                f.save(tmp)

            # 대용량 PDF 자동 압축
            pdf_to_parse = tmp_path
            if compress_needed:
                fd_compressed, compressed_path = tempfile.mkstemp(suffix=".pdf")
                os.close(fd_compressed)  # 파일 디스크립터 닫기
                success, method = compress_pdf(tmp_path, compressed_path)
                if success:
                    compressed_size = os.path.getsize(compressed_path)
                    original_size = os.path.getsize(tmp_path)
                    ratio = (compressed_size / original_size * 100) if original_size > 0 else 0
                    print(
                        f"[PDF 압축] {method}: {original_size / 1024 / 1024:.1f}MB → {compressed_size / 1024 / 1024:.1f}MB ({ratio:.1f}%)",
                        flush=True,
                    )
                    pdf_to_parse = compressed_path

            try:
                parsed = parse_pdf(pdf_to_parse)
                data = build_report_data(parsed)
                # 파싱 성공 후 압축된 파일 사용 확인 및 원본 삭제
                if compress_needed and compressed_path and os.path.exists(tmp_path):
                    os.unlink(tmp_path)  # 파싱 성공하면 원본 삭제
                    tmp_path = compressed_path  # 저장할 파일 경로 업데이트
            except ReportParseError as e:
                # 압축된 PDF가 손상된 경우, 원본 PDF로 재시도
                if compress_needed and compressed_path and os.path.exists(tmp_path):
                    print(
                        f"[경고] 압축된 PDF의 텍스트 추출 실패, 원본 PDF로 재시도 중...",
                        flush=True,
                    )
                    # 압축된 파일 삭제 후 원본으로 파싱 재시도
                    if os.path.exists(compressed_path):
                        os.unlink(compressed_path)
                    try:
                        parsed = parse_pdf(tmp_path)
                        data = build_report_data(parsed)
                    except ReportParseError:
                        raise e  # 원본도 실패하면 원래 오류 메시지 반환
                else:
                    raise
        else:  # is_xlsx
            try:
                fd, tmp_path = tempfile.mkstemp(suffix=".xlsx")
                with os.fdopen(fd, "wb") as tmp:
                    f.save(tmp)
                excel_result = parse_excel_file(tmp_path)
                # Excel 데이터를 PDF 파서와 호환되는 형식으로 변환
                parsed_report = excel_result.to_parsed_report()
                data = build_report_data(parsed_report)
            except ImportError:
                return render_template("upload.html.j2", **_get_upload_context(error="Excel 지원이 설치되지 않았습니다")), 500
            except ReportParseError as e:
                return render_template("upload.html.j2", **_get_upload_context(error=f"Excel 파일 오류: {str(e)}")), 400
    except ReportParseError as e:
        return render_template("upload.html.j2", **_get_upload_context(error=str(e))), 400
    except Exception as e:  # noqa: BLE001 — 사용자에게 원인 안내
        import traceback
        error_detail = traceback.format_exc()
        print(f"[오류] 리포트 생성 중 문제 발생:\n{error_detail}", flush=True)
        return render_template("upload.html.j2", **_get_upload_context(error=f"리포트 생성 중 오류가 발생했습니다: {e}")), 500
    finally:
        # 사용되지 않은 압축 파일 정리
        if compressed_path and os.path.exists(compressed_path) and (not tmp_path or compressed_path != tmp_path):
            try:
                os.unlink(compressed_path)
            except:
                pass
        # 성공한 임시 파일을 업로드 디렉토리로 이동 (메모리 사용 최소화)
        if tmp_path and os.path.exists(tmp_path):
            file_ext = f.filename.split(".")[-1] if "." in f.filename else "bin"
            upload_file_path = UPLOAD_DIR / f"{secrets.token_hex(16)}.{file_ext}"
            os.rename(tmp_path, upload_file_path)

    # 임시 리포트 저장 후 수정 페이지로 이동
    draft_id = _generate_draft_id()
    _draft_reports[draft_id] = {
        "data": data,
        "user_id": user["id"],
        "user_name": user["name"],
        "created_at": time.time(),
        "source_file_name": f.filename,
        "source_file_path": str(upload_file_path),
    }
    return redirect(url_for("edit_report", draft_id=draft_id))


@app.route("/edit-report/<draft_id>", methods=["GET", "POST"])
def edit_report(draft_id: str):
    user = current_user()
    draft = _draft_reports.get(draft_id)
    if not draft:
        abort(404)
    if draft["user_id"] != user["id"]:
        abort(403)

    data = draft["data"]

    if request.method == "GET":
        # 편집 UI 표시
        import json
        from datetime import datetime
        recommendations = data.get("recommendations", [])
        insights = data.get("insights", [])
        coverage_sections = data.get("coverage_sections", [])
        header = data.get("header", {})
        shortfall_coverage = data.get("shortfall_coverage", {})
        csrf_token = _get_csrf_token()

        # 생성일시 포맷 (한국 시간)
        from datetime import timezone, timedelta
        created_at = draft.get("created_at", time.time())
        kst = timezone(timedelta(hours=9))
        created_datetime = datetime.fromtimestamp(created_at, tz=kst).strftime("%Y-%m-%d %H:%M")

        html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>리포트 편집</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:"Pretendard Variable",Pretendard,-apple-system,sans-serif;background:#F6F7F9;color:#10233F;padding:24px}}
.container{{max-width:880px;margin:0 auto}}
h1{{font-size:24px;margin-bottom:8px}}
.meta{{font-size:12px;color:#5B6B82;margin-bottom:28px}}
.section{{background:#fff;border-radius:12px;margin-bottom:24px;padding:24px;border:1px solid #E3E7EE}}
.section h2{{font-size:18px;margin-bottom:16px;color:#10233F}}
.form-group{{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #F0F3F8}}
.form-group:last-child{{border:none;margin-bottom:0;padding-bottom:0}}
.form-group label{{display:block;margin-bottom:6px;font-weight:600;font-size:14px}}
.form-group input[type="text"],.form-group textarea{{width:100%;padding:8px 12px;border:1px solid #E3E7EE;border-radius:8px;font-family:inherit;font-size:13px}}
.form-group textarea{{resize:vertical;min-height:60px}}
.checkbox-group{{display:flex;align-items:center;gap:8px;margin-bottom:8px}}
.checkbox-group input[type="checkbox"]{{width:18px;height:18px;cursor:pointer}}
.checkbox-group label{{margin:0;cursor:pointer;flex:1}}
.btn{{padding:10px 16px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}}
.btn-primary{{background:#1D5BD8;color:#fff}}
.btn-danger{{background:#C93030;color:#fff;padding:8px 12px;font-size:12px}}
.btn-secondary{{background:#E3E7EE;color:#10233F;padding:8px 12px;font-size:12px}}
.action-bar{{display:flex;gap:12px;margin-top:24px}}
.item{{background:#FAFBFC;padding:12px;border-radius:8px;border:1px solid #E3E7EE;margin-bottom:8px}}
.urgent-badge{{background:#FBEDED;color:#C93030;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}}
</style>
</head>
<body>
<div class="container">
<h1>{header.get('name', '')}님 리포트 편집</h1>
<p class="meta">생성일시: {created_datetime}</p>

<form method="POST">
  <input type="hidden" name="_csrf_token" value="{csrf_token}">
  <div class="section">
    <h2>1. 보완 추천 (최대 3개)</h2>
    <p style="font-size:12px;color:#5B6B82;margin-bottom:16px">완성된 리포트에 포함할 추천 항목을 선택하고 내용을 수정하세요.</p>
"""
        for idx, reco in enumerate(recommendations):
            checked = "checked" if reco.get("_included", True) else ""
            html += f"""
    <div class="item">
      <div class="checkbox-group">
        <input type="checkbox" name="reco_include_{idx}" value="1" {checked} id="reco_{idx}">
        <label for="reco_{idx}">추천 {reco.get('rank', idx+1)} - 포함하기</label>
      </div>
      <div style="display:{'block' if reco.get('_included', True) else 'none'}">
        <div class="form-group">
          <label for="reco_title_{idx}">제목</label>
          <input type="text" name="reco_title_{idx}" value="{reco.get('title', '')}">
        </div>
        <div class="form-group">
          <label for="reco_detail_{idx}">상품 설명</label>
          <input type="text" name="reco_detail_{idx}" value="{reco.get('detail', '')}">
        </div>
        <div class="form-group">
          <label for="reco_why_{idx}">추천 이유</label>
          <textarea name="reco_why_{idx}">{reco.get('why', '')}</textarea>
        </div>
      </div>
    </div>
"""

        html += """  </div>

  <div class="section">
    <h2>2. 핵심 진단 및 제언</h2>
    <p style="font-size:12px;color:#5B6B82;margin-bottom:16px">항목을 수정하거나 새로 추가할 수 있습니다.</p>
"""

        for idx, insight in enumerate(insights):
            checked = "checked" if insight.get("_included", True) else ""
            urgent_checked = "checked" if insight.get("urgent") else ""
            html += f"""
    <div class="item">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <div class="checkbox-group" style="margin:0">
          <input type="checkbox" name="insight_include_{idx}" value="1" {checked} id="insight_{idx}">
          <label for="insight_{idx}" style="margin:0">진단 {idx+1} - 포함하기</label>
        </div>
        <div class="checkbox-group" style="margin:0">
          <input type="checkbox" name="insight_urgent_{idx}" value="1" {urgent_checked} id="insight_urgent_{idx}" style="accent-color:#FF9500">
          <label for="insight_urgent_{idx}" style="margin:0;background:#FF9500;color:#fff;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600">긴급</label>
        </div>
      </div>
      <div style="display:{'block' if insight.get('_included', True) else 'none'}">
        <div class="form-group">
          <label for="insight_title_{idx}">제목</label>
          <input type="text" name="insight_title_{idx}" value="{insight.get('title', '')}">
        </div>
        <div class="form-group">
          <label for="insight_text_{idx}">내용</label>
          <textarea name="insight_text_{idx}">{insight.get('text', '')}</textarea>
        </div>
      </div>
    </div>
"""

        html += f"""
    <div id="new-insights-container"></div>
    <button type="button" class="btn btn-secondary" style="margin-top:16px" onclick="addNewInsightPanel()">+ 새 항목 추가</button>
  </div>

  <div class="section">
    <h2>3. 영역별 보장 진단</h2>
    <p style="font-size:12px;color:#5B6B82;margin-bottom:16px">각 보장 영역의 진단 금액을 수정할 수 있습니다.</p>
"""

        coverage_section_idx = 0
        for sec in coverage_sections:
            # 편집 대상이 아닌 항목들을 제외
            editable_rows = [row for row in sec.get('rows', []) if not row.get('excluded_from_editing', False)]
            if not editable_rows:
                coverage_section_idx += 1
                continue

            html += f"""    <div style="margin-bottom:24px;padding:16px;background:#FAFBFC;border-radius:8px;border:1px solid #E3E7EE">
      <h3 style="font-size:15px;font-weight:600;margin-bottom:12px">{sec.get('title', '')}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#F0F3F8">
            <th style="padding:8px;text-align:left;border-bottom:1px solid #E3E7EE">항목</th>
            <th style="padding:8px;text-align:right;border-bottom:1px solid #E3E7EE">가입</th>
          </tr>
        </thead>
        <tbody>
"""
            for row_idx, row in enumerate(editable_rows):
                row_id = f"cov_{coverage_section_idx}_{row_idx}"
                held_value = row.get('held_display', '')
                html += f"""          <tr style="border-bottom:1px solid #E3E7EE">
            <td style="padding:8px">{row.get('label', '')}</td>
            <td style="padding:8px;text-align:right">
              <input type="text" name="cov_held_{coverage_section_idx}_{row_idx}" value="{held_value}"
                     style="width:100px;padding:4px 8px;border:1px solid #E3E7EE;border-radius:4px;text-align:right" />
            </td>
          </tr>
"""
            html += """        </tbody>
      </table>
    </div>
"""
            coverage_section_idx += 1

        html += f"""  </div>

  <div class="section">
    <h2>4. 부족 보장 추가</h2>
    <p style="font-size:12px;color:#5B6B82;margin-bottom:16px">추가로 필요한 보장을 선택하세요. 현재 나이: {shortfall_coverage.get('current_age', '-')}세 (30년 납입 기준)</p>
"""
        shortfall_items = shortfall_coverage.get("items", [])
        selected_ids = shortfall_coverage.get("selected_ids", [])

        if shortfall_items:
            html += f"""    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px" id="shortfall-items-container">
"""
            for item in shortfall_items:
                item_id = item.get("id")
                checked = "checked" if item_id in selected_ids else ""
                html += f"""      <div class="shortfall-item" style="padding:12px;background:#FAFBFC;border-radius:8px;border:2px solid #E3E7EE;cursor:pointer;transition:all 0.2s" onclick="toggleShortfallItem(event, {item_id})">
        <div class="checkbox-group" style="margin:0;pointer-events:none">
          <input type="checkbox" name="shortfall_item_{item_id}" value="on" {checked} id="shortfall_{item_id}">
          <label for="shortfall_{item_id}" style="cursor:pointer;font-weight:600;font-size:13px;margin:0">{item.get('display_name', '')}</label>
        </div>
      </div>
"""
            html += f"""    </div>
"""
        else:
            html += """    <p style="color:#5B6B82">부족 보장 항목 데이터를 불러올 수 없습니다.</p>
"""

        html += f"""  </div>

  <div class="action-bar">
    <button type="submit" class="btn btn-primary">완성된 리포트 저장</button>
    <button type="button" class="btn btn-secondary" onclick="window.history.back()">취소</button>
  </div>

  <input type="hidden" name="draft_id" value="{draft_id}">
  <input type="hidden" name="insights_count" value="{len(insights)}">
  <input type="hidden" name="new_insights_count" value="0" id="new_insights_count">
  <input type="hidden" name="coverage_sections_count" value="{len(coverage_sections)}">
</form>
</div>

<script>
function toggleShortfallItem(event, itemId) {{
  const checkbox = document.getElementById(`shortfall_${{itemId}}`);
  if (checkbox) {{
    checkbox.checked = !checkbox.checked;
    updateShortfallItemStyle(itemId);
  }}
}}

function updateShortfallItemStyle(itemId) {{
  const checkbox = document.getElementById(`shortfall_${{itemId}}`);
  const items = document.querySelectorAll('.shortfall-item');
  items.forEach(item => {{
    const cb = item.querySelector('input[type="checkbox"]');
    if (cb && cb.id === `shortfall_${{itemId}}`) {{
      if (checkbox.checked) {{
        item.style.background = '#E3F2FD';
        item.style.borderColor = '#1D5BD8';
        item.style.borderWidth = '2px';
      }} else {{
        item.style.background = '#FAFBFC';
        item.style.borderColor = '#E3E7EE';
        item.style.borderWidth = '2px';
      }}
    }}
  }});
}}

// 초기 스타일 설정
function initShortfallItemStyles() {{
  const items = document.querySelectorAll('.shortfall-item');
  items.forEach(item => {{
    const cb = item.querySelector('input[type="checkbox"]');
    if (cb && cb.checked) {{
      item.style.background = '#E3F2FD';
      item.style.borderColor = '#1D5BD8';
    }}
  }});
}}

let newInsightCount = 0;
function addNewInsightPanel() {{
  const container = document.getElementById('new-insights-container');
  const panelNumber = container.querySelectorAll('[id^="new-insight-panel-"]').length + 1;
  const idx = newInsightCount++;
  const panel = document.createElement('div');
  panel.className = 'item';
  panel.style.marginTop = '16px';
  panel.style.background = '#EDF3FE';
  panel.id = `new-insight-panel-${{idx}}`;
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <span style="font-size:13px;font-weight:600">새 항목 ${{panelNumber}}</span>
      <button type="button" class="btn btn-secondary" onclick="removeNewInsightPanel(${{idx}})">제거</button>
      <div class="checkbox-group" style="margin:0">
        <input type="checkbox" name="new_insight_urgent_${{idx}}" value="1" id="new_urgent_${{idx}}" style="accent-color:#FF9500">
        <label for="new_urgent_${{idx}}" style="margin:0;background:#FF9500;color:#fff;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600">긴급</label>
      </div>
    </div>
    <div class="form-group">
      <label>제목</label>
      <input type="text" name="new_insight_title_${{idx}}" placeholder="새 항목의 제목을 입력하세요">
    </div>
    <div class="form-group">
      <label>내용</label>
      <textarea name="new_insight_text_${{idx}}" placeholder="새 항목의 내용을 입력하세요"></textarea>
    </div>
  `;
  container.appendChild(panel);
  document.getElementById('new_insights_count').value = newInsightCount;
}}
function removeNewInsightPanel(idx) {{
  const panel = document.getElementById(`new-insight-panel-${{idx}}`);
  if (panel) {{
    panel.remove();
    document.getElementById('new_insights_count').value = Math.max(0, parseInt(document.getElementById('new_insights_count').value) - 1);
  }}
}}

// 페이지 로드 시 스타일 초기화
document.addEventListener('DOMContentLoaded', function() {{
  initShortfallItemStyles();
}});
</script>

</body>
</html>
"""
        return html

    # POST: 수정된 데이터로 최종 저장
    if not _check_csrf_token():
        abort(403)

    recommendations = data.get("recommendations", [])
    insights = data.get("insights", [])
    coverage_sections = data.get("coverage_sections", [])
    shortfall_coverage = data.get("shortfall_coverage", {})

    # 추천 항목 처리
    modified_recommendations = []
    for idx, reco in enumerate(recommendations):
        if request.form.get(f"reco_include_{idx}"):
            modified_reco = dict(reco)
            modified_reco["title"] = request.form.get(f"reco_title_{idx}", reco.get("title"))
            modified_reco["detail"] = request.form.get(f"reco_detail_{idx}", reco.get("detail"))
            modified_reco["why"] = request.form.get(f"reco_why_{idx}", reco.get("why"))
            modified_recommendations.append(modified_reco)

    # 핵심 진단 처리
    modified_insights = []
    insights_count = int(request.form.get("insights_count", 0))
    for idx in range(insights_count):
        if request.form.get(f"insight_include_{idx}"):
            default_insight = insights[idx] if idx < len(insights) else {}
            modified_insights.append({
                "title": request.form.get(f"insight_title_{idx}", default_insight.get("title", "")),
                "text": request.form.get(f"insight_text_{idx}", default_insight.get("text", "")),
                "urgent": bool(request.form.get(f"insight_urgent_{idx}")),
            })

    # 새 항목 추가 (동적으로 추가된 여러 개 처리)
    new_insights_count = int(request.form.get("new_insights_count", 0))
    for idx in range(new_insights_count):
        new_title = request.form.get(f"new_insight_title_{idx}", "").strip()
        new_text = request.form.get(f"new_insight_text_{idx}", "").strip()
        if new_title or new_text:
            modified_insights.append({
                "title": new_title,
                "text": new_text,
                "urgent": bool(request.form.get(f"new_insight_urgent_{idx}")),
            })

    # 보장 진단 항목 처리
    modified_coverage_sections = []
    coverage_sections_count = int(request.form.get("coverage_sections_count", 0))
    for sec_idx in range(coverage_sections_count):
        if sec_idx < len(coverage_sections):
            original_section = coverage_sections[sec_idx]
            modified_section = {
                "title": original_section.get("title"),
                "rows": []
            }
            for row_idx, row in enumerate(original_section.get("rows", [])):
                modified_row = dict(row)
                new_held = request.form.get(f"cov_held_{sec_idx}_{row_idx}", "")
                if new_held:
                    modified_row["held_display"] = new_held
                    # 수정된 금액을 기반으로 진단 재계산
                    try:
                        # indemnity_pair 처리: "injury / disease" 형식 (rules.py에서는 injury가 먼저)
                        if row.get("source_brand_codes") and " / " in new_held:
                            parts = new_held.split(" / ")
                            if len(parts) == 2:
                                try:
                                    injury_num = float(parts[0].replace(',', ''))
                                    disease_num = float(parts[1].replace(',', ''))
                                    held_num = min(disease_num, injury_num)
                                except:
                                    held_num = 0
                            else:
                                held_num = 0
                        else:
                            held_num = float(new_held.replace(',', ''))

                        recommend_num = None
                        if row.get('recommend_display') and row.get('recommend_display') != '—':
                            try:
                                recommend_num = float(row.get('recommend_display', '0').replace(',', ''))
                            except:
                                pass

                        # 진단 재계산
                        if held_num <= 0:
                            modified_row["status"] = "gap"
                            modified_row["diagnosis"] = "미가입"
                            modified_row["ratio"] = 0.02
                        elif recommend_num is None:
                            modified_row["status"] = "ok" if held_num > 0 else "gap"
                            modified_row["diagnosis"] = "보유" if held_num > 0 else "미가입"
                            modified_row["ratio"] = 1.0 if held_num > 0 else 0.02
                        else:
                            ratio = held_num / recommend_num if recommend_num > 0 else 0
                            if ratio >= 1:
                                modified_row["status"] = "ok"
                                modified_row["diagnosis"] = "적정" if ratio == 1 else f"적정 +{int(held_num - recommend_num):,}"
                                modified_row["ratio"] = min(ratio, 1.0)
                            else:
                                modified_row["status"] = "warn"
                                word = "주의" if ratio >= 0.5 else "부족"
                                modified_row["diagnosis"] = f"{word} −{int(recommend_num - held_num):,}"
                                modified_row["ratio"] = ratio
                    except Exception as e:
                        pass
                modified_section["rows"].append(modified_row)
            modified_coverage_sections.append(modified_section)

    # 부족 보장 추가 처리
    modified_shortfall_coverage = dict(shortfall_coverage)
    selected_shortfall_ids = []
    shortfall_items = shortfall_coverage.get("items", [])
    for item in shortfall_items:
        item_id = item.get("id")
        if request.form.get(f"shortfall_item_{item_id}"):
            selected_shortfall_ids.append(item_id)
    modified_shortfall_coverage["selected_ids"] = selected_shortfall_ids

    # 선택된 항목의 프리미엄 계산
    if selected_shortfall_ids:
        from .builder import _calculate_shortfall_premium
        current_age = shortfall_coverage.get("current_age", 0)
        premium_data = _calculate_shortfall_premium(selected_shortfall_ids, current_age, payment_years=30)
        modified_shortfall_coverage["premium_data"] = premium_data
    else:
        modified_shortfall_coverage["premium_data"] = None

    # 데이터 업데이트
    data["recommendations"] = modified_recommendations
    data["insights"] = modified_insights
    data["coverage_sections"] = modified_coverage_sections if modified_coverage_sections else coverage_sections
    data["shortfall_coverage"] = modified_shortfall_coverage

    # 생성일시 추가 (한국 시간)
    from datetime import datetime, timezone, timedelta
    created_at = draft.get("created_at", time.time())
    kst = timezone(timedelta(hours=9))
    data["created_at"] = created_at
    data["created_datetime"] = datetime.fromtimestamp(created_at, tz=kst).strftime("%Y-%m-%d %H:%M")

    # DB에 저장
    report_id = storage.save_report(
        data,
        created_by_user_id=user["id"],
        created_by_name=user["name"],
        source_file_name=draft.get("source_file_name"),
        source_file_path=draft.get("source_file_path"),
    )

    # 임시 데이터 정리
    del _draft_reports[draft_id]

    return redirect(url_for("view_report", report_id=report_id))


@app.get("/reports")
def reports_list():
    user = current_user()
    reports = storage.list_reports() if user["role"] == "admin" else storage.list_reports(created_by_user_id=user["id"])
    return render_template("reports_list.html.j2", reports=reports, user=user)


def _can_access(meta: dict, user: dict) -> bool:
    return user["role"] == "admin" or meta.get("created_by_user_id") == user["id"]


def _share_url(token: str | None) -> str | None:
    if not token:
        return None
    return url_for("shared_report", token=token, _external=True)


@app.get("/reports/<int:report_id>")
def view_report(report_id: int):
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if not meta:
        abort(404)
    if not _can_access(meta, user):
        abort(403)
    data = storage.get_report(report_id)
    html = render_html(
        {
            **data,
            "report_id": report_id,
            "user": user,
            "share_url": _share_url(meta.get("share_token")),
            "is_public_view": False,
            "kakao_js_key": KAKAO_JS_KEY,
            "chat_endpoint": url_for("report_chat", report_id=report_id),
            "chat_enabled": bool(chatbot.ANTHROPIC_API_KEY),
        }
    )
    filename = f"{data['header']['name']}_성우아빠의보장분석리포트.html"
    resp = Response(html, mimetype="text/html")
    # 한글 파일명은 latin-1 헤더 인코딩을 통과하지 못하므로 RFC 5987 인코딩 사용
    resp.headers["Content-Disposition"] = f"inline; filename*=UTF-8''{quote(filename)}"
    return resp


@app.get("/reports/<int:report_id>/download-source")
def download_source_file(report_id: int):
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if not meta:
        abort(404)
    if not _can_access(meta, user):
        abort(403)
    source_file = storage.get_source_file(report_id, user_id=user["id"])
    if not source_file or not source_file[1]:
        abort(404)
    filename, file_path = source_file

    # 파일이 존재하는지 확인
    file_path_obj = Path(file_path)
    if not file_path_obj.exists():
        abort(404)

    # 파일 스트리밍 다운로드
    from flask import send_file
    return send_file(
        file_path_obj,
        as_attachment=True,
        download_name=filename
    )


@app.post("/reports/<int:report_id>/delete")
def delete_report(report_id: int):
    if not _check_csrf_token():
        abort(403)
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if meta and _can_access(meta, user):
        # 업로드된 원본 파일도 함께 삭제
        source_file = storage.get_source_file(report_id, user_id=user["id"])
        if source_file and source_file[1]:
            file_path = Path(source_file[1])
            if file_path.exists():
                try:
                    file_path.unlink()  # 파일 삭제
                except Exception:
                    pass  # 파일 삭제 실패해도 무시 (DB 삭제는 진행)
        storage.delete_report(report_id)
    return redirect(url_for("reports_list"))


@app.get("/reports/<int:report_id>/coverage-summary")
def coverage_summary(report_id: int):
    """보험사별 담보보장 요약 (실손/정액 구분)"""
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if not meta or not _can_access(meta, user):
        abort(403)
    data = storage.get_report(report_id)
    if not data:
        abort(404)

    # 데이터 준비
    contracts = data.get("contracts", [])
    detail_items = data.get("detail_items", [])

    # 보험사별 정리
    by_company = {}
    for item in detail_items:
        company = item.get("company", "기타")
        if company not in by_company:
            by_company[company] = {"실손": [], "정액": [], "기타": []}

        category = item.get("category", "기타")
        item_type = "실손" if "실손" in category or "의료비" in category or "상해" in category else "정액"
        by_company[company][item_type].append(item)

    # HTML 보고서 생성
    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{data.get('header', {}).get('name')}님 - 보험사별 담보보장 요약</title>
    <style>
        body {{ font-family: -apple-system, "Pretendard", sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }}
        .container {{ max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; }}
        h1 {{ font-size: 28px; color: #10233F; margin: 0 0 10px 0; }}
        .subtitle {{ color: #666; margin-bottom: 30px; font-size: 14px; }}
        .company-section {{ margin-bottom: 30px; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px; }}
        .company-name {{ font-size: 18px; font-weight: 700; color: #1D5BD8; margin-bottom: 15px; }}
        .type-table {{ width: 100%; margin-bottom: 15px; border-collapse: collapse; }}
        .type-table th {{ background: #f0f3f8; padding: 10px; text-align: left; font-weight: 600; font-size: 13px; border-bottom: 2px solid #ddd; }}
        .type-table td {{ padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 13px; }}
        .type-table tr:hover {{ background: #fafbfc; }}
        .type-label {{ font-weight: 600; color: #333; padding: 10px; background: #f0f3f8; margin-top: 10px; margin-bottom: 5px; border-radius: 4px; }}
        @media print {{ body {{ background: white; }} .container {{ box-shadow: none; }} }}
    </style>
</head>
<body>
    <div class="container">
        <h1>{data.get('header', {}).get('name')}님 보험사별 담보보장 요약</h1>
        <p class="subtitle">생성일시: {data.get('header', {}).get('basis_date_display', '확인불가')}</p>
"""

    for company in sorted(by_company.keys()):
        items_by_type = by_company[company]
        html += f'<div class="company-section"><div class="company-name">{company}</div>'

        for type_name in ["실손", "정액", "기타"]:
            items = items_by_type.get(type_name, [])
            if not items:
                continue

            html += f'<div class="type-label">{type_name}</div>'
            html += '<table class="type-table"><thead><tr><th>상품명</th><th>담보명</th><th>금액</th><th>납입기간</th></tr></thead><tbody>'

            for item in items:
                product = item.get("product", "-")
                rider = item.get("rider_name", "-")
                amount = item.get("amount_man", 0)
                pay_years = item.get("pay_years")
                pay_period = f"{pay_years}년" if pay_years else item.get("pay_method", "-")

                html += f'<tr><td>{product}</td><td>{rider}</td><td>{amount:,}만원</td><td>{pay_period}</td></tr>'

            html += '</tbody></table>'

        html += '</div>'

    html += """
    </div>
</body>
</html>
"""

    resp = Response(html, mimetype="text/html")
    customer_name = data.get('header', {}).get('name', '고객')
    filename = f"{customer_name}_담보보장요약.html"
    resp.headers["Content-Disposition"] = f"inline; filename*=UTF-8''{quote(filename)}"
    return resp


@app.post("/reports/<int:report_id>/notes")
def save_report_notes(report_id: int):
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if not meta or not _can_access(meta, user):
        abort(403)

    body = request.get_json(silent=True) or {}
    notes = body.get("notes", "").strip()

    storage.save_notes(report_id, notes)
    return {"success": True, "notes": notes}


@app.get("/reports/<int:report_id>/notes")
def get_report_notes(report_id: int):
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if not meta or not _can_access(meta, user):
        abort(403)

    notes = storage.get_notes(report_id)
    return jsonify({"notes": notes or ""})


@app.get("/reports/<int:report_id>/feedback")
def get_feedback(report_id: int):
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if not meta or not _can_access(meta, user):
        abort(403)
    feedbacks = storage.get_report_feedback(report_id)
    return jsonify(feedbacks)


@app.post("/reports/<int:report_id>/feedback")
def add_feedback(report_id: int):
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if not meta or not _can_access(meta, user):
        abort(403)

    body = request.get_json(silent=True) or {}
    content = body.get("content", "").strip()
    if not content:
        return {"error": "피드백 내용을 입력하세요."}, 400

    feedback_id = storage.save_feedback(report_id, user["id"], content)
    return {"id": feedback_id, "content": content}, 201


@app.put("/reports/<int:report_id>/feedback/<int:feedback_id>")
def update_feedback(report_id: int, feedback_id: int):
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if not meta or not _can_access(meta, user):
        abort(403)

    body = request.get_json(silent=True) or {}
    content = body.get("content", "").strip()
    if not content:
        return {"error": "피드백 내용을 입력하세요."}, 400

    storage.update_feedback(feedback_id, content)
    return {"id": feedback_id, "content": content}


@app.post("/reports/<int:report_id>/feedback/<int:feedback_id>/resolve")
def resolve_feedback_endpoint(report_id: int, feedback_id: int):
    """피드백 반영 완료 표시 (관리자만 가능)"""
    user = current_user()
    if user["role"] != "admin":
        abort(403)

    meta = storage.get_report_meta(report_id)
    if not meta:
        abort(404)

    storage.resolve_feedback(feedback_id, user["id"])
    return {"success": True, "feedback_id": feedback_id, "resolved_by": user["name"]}


@app.post("/reports/<int:report_id>/feedback/<int:feedback_id>/unresolve")
def unresolve_feedback_endpoint(report_id: int, feedback_id: int):
    """피드백 반영 완료 해제 (관리자만 가능)"""
    user = current_user()
    if user["role"] != "admin":
        abort(403)

    meta = storage.get_report_meta(report_id)
    if not meta:
        abort(404)

    storage.unresolve_feedback(feedback_id)
    return {"success": True, "feedback_id": feedback_id}


@app.delete("/reports/<int:report_id>/feedback/<int:feedback_id>")
def delete_feedback_item(report_id: int, feedback_id: int):
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if not meta or not _can_access(meta, user):
        abort(403)

    storage.delete_feedback(feedback_id)
    return {"success": True}


@app.post("/reports/<int:report_id>/share")
def create_share_link(report_id: int):
    if not _check_csrf_token() and request.headers.get("Accept") != "application/json":
        abort(403)
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if not meta or not _can_access(meta, user):
        abort(403)
    token = storage.get_or_create_share_token(report_id)
    url = _share_url(token)
    if request.headers.get("Accept") == "application/json":
        return {"url": url}
    return redirect(url_for("view_report", report_id=report_id))


@app.post("/reports/<int:report_id>/unshare")
def revoke_share_link(report_id: int):
    if not _check_csrf_token():
        abort(403)
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if not meta or not _can_access(meta, user):
        abort(403)
    storage.revoke_share_token(report_id)
    return redirect(url_for("view_report", report_id=report_id))


def _share_verified_key(token: str) -> str:
    return f"share_verified_{token}"


@app.route("/s/<token>", methods=["GET", "POST"])
def shared_report(token: str):
    data = storage.get_report_by_share_token(token)
    if not data:
        abort(404)

    # 카카오톡 등으로 공유된 링크는 담당자(분석자) 휴대폰번호를 입력해야 열리도록 게이트를 둔다.
    # (담당자 계정이 없는 옛 데이터 등 번호를 확인할 수 없는 경우는 게이트 없이 통과)
    owner_phone = storage.get_owner_phone_for_token(token)
    verified_key = _share_verified_key(token)
    if owner_phone and not session.get(verified_key):
        error = None
        if request.method == "POST":
            entered = _normalize_phone(request.form.get("phone", ""))
            if entered and hmac.compare_digest(entered, owner_phone):
                session[verified_key] = True
            else:
                error = "휴대폰번호가 일치하지 않습니다. 리포트를 보내주신 분에게 다시 확인해주세요."
        if not session.get(verified_key):
            return render_template(
                "share_gate.html.j2", error=error, customer_name=data["header"]["name"], logo_mark=LOGO_MARK
            )

    html = render_html(
        {
            **data,
            "share_url": None,
            "is_public_view": True,
            "kakao_js_key": None,
            "chat_endpoint": url_for("shared_report_chat", token=token),
            "chat_enabled": bool(chatbot.ANTHROPIC_API_KEY),
        }
    )
    resp = Response(html, mimetype="text/html")
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    return resp


@app.post("/reports/<int:report_id>/chat")
def report_chat(report_id: int):
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if not meta or not _can_access(meta, user):
        abort(403)
    if _chat_rate_limited(f"r{report_id}"):
        return {"error": "질문이 너무 잦습니다. 잠시 후 다시 시도해주세요."}, 429
    body = request.get_json(silent=True) or {}
    data = storage.get_report(report_id)
    try:
        answer = chatbot.ask(body.get("question", ""), data, body.get("history"))
    except chatbot.ChatbotError as e:
        return {"error": str(e)}, 400
    return {"answer": answer}


@app.post("/s/<token>/chat")
def shared_report_chat(token: str):
    data = storage.get_report_by_share_token(token)
    if not data:
        abort(404)
    owner_phone = storage.get_owner_phone_for_token(token)
    if owner_phone and not session.get(_share_verified_key(token)):
        abort(403)
    if _chat_rate_limited(f"s{token}"):
        return {"error": "질문이 너무 잦습니다. 잠시 후 다시 시도해주세요."}, 429
    body = request.get_json(silent=True) or {}
    try:
        answer = chatbot.ask(body.get("question", ""), data, body.get("history"))
    except chatbot.ChatbotError as e:
        return {"error": str(e)}, 400
    return {"answer": answer}


@app.get("/compare")
def compare():
    user = current_user()
    ids = [int(x) for x in request.args.getlist("ids") if x.isdigit()]
    reports = []
    for report_id in ids:
        meta = storage.get_report_meta(report_id)
        if meta and _can_access(meta, user):
            reports.append(storage.get_report(report_id))
    if len(reports) < 2:
        return redirect(url_for("reports_list"))
    comparison = build_comparison(reports)
    return render_template("compare.html.j2", user=user, **comparison)


@app.get("/admin")
@admin_required
def admin_dashboard():
    all_data = storage.get_all_report_data()
    total_reports = len(all_data)
    total_customers = len({d["header"]["name"] for d in all_data})
    premiums = [
        int(d["kpis"]["monthly_premium"].replace(",", ""))
        for d in all_data
        if d.get("kpis", {}).get("monthly_premium")
    ]
    avg_premium = round(sum(premiums) / len(premiums)) if premiums else 0

    gap_counter: Counter[str] = Counter()
    for d in all_data:
        for sec in d.get("coverage_sections", []):
            for row in sec["rows"]:
                if row["status"] == "gap":
                    gap_counter[row["label"]] += 1
    top_gaps = gap_counter.most_common(8)

    users = [{**u, "phone": _mask_phone(u["phone"])} for u in storage.list_users()]

    # 활동 중인 사용자 (최근 10분 이내)
    active_users = []
    try:
        active_users = storage.list_active_users(minutes=10)
    except Exception:
        pass  # 활동 조회 실패는 무시

    active_users_display = [{
        "name": u["name"],
        "phone": _mask_phone(u["phone"]),
        "role": u.get("role", "user"),
        "last_login_at": u.get("last_login_at", ""),
    } for u in active_users]

    return render_template(
        "admin.html.j2",
        user=current_user(),
        total_reports=total_reports,
        total_customers=total_customers,
        avg_premium=avg_premium,
        top_gaps=top_gaps,
        reports=storage.list_reports(),
        users=users,
        active_users=active_users_display,
    )


@app.route("/admin/approve-users", methods=["GET"])
@admin_required
def admin_approve_users():
    """신규 가입자 승인 페이지"""
    user = current_user()
    if not user or user["role"] != "admin":
        abort(403)

    pending_users = storage.get_pending_users()

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="data:image/svg+xml,<svg%20xmlns='http%3A//www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'><path%20d='M4%2021%20A16%2015%200%200%201%2036%2021%20Z'%20fill='%2310233F'/><rect%20x='9'%20y='21'%20width='4.4'%20height='6'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='17.8'%20y='21'%20width='4.4'%20height='10'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='26.6'%20y='21'%20width='4.4'%20height='14'%20rx='1.6'%20fill='%231D5BD8'/></svg>">
<title>신규 가입자 승인</title>
<style>
  :root{{--ink:#10233F;--paper:#F6F7F9;--card:#FFFFFF;--line:#E3E7EE;--sub:#5B6B82;--ok:#1D5BD8;--gap:#C93030}}
  *{{box-sizing:border-box}}
  body{{font-family:-apple-system,"Pretendard",sans-serif;background:var(--paper);color:var(--ink);margin:0;padding:40px 20px;line-height:1.6}}
  .wrap{{max-width:600px;margin:0 auto}}
  h1{{font-size:24px;margin-bottom:6px}}
  p.sub{{color:var(--sub);font-size:13.5px;margin-bottom:24px}}
  .user-list{{display:flex;flex-direction:column;gap:12px}}
  .user-card{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px;display:flex;justify-content:space-between;align-items:center}}
  .user-info{{flex:1}}
  .user-name{{font-weight:600;font-size:15px;margin-bottom:4px}}
  .user-phone{{color:var(--sub);font-size:13px}}
  .user-date{{color:var(--sub);font-size:12px;margin-top:4px}}
  .actions{{display:flex;gap:8px}}
  button{{padding:8px 14px;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s}}
  .btn-approve{{background:var(--ok);color:#fff}}
  .btn-approve:hover{{opacity:0.9}}
  .btn-reject{{background:#F0F0F0;color:var(--gap)}}
  .btn-reject:hover{{background:#E8E8E8}}
  .empty{{text-align:center;padding:40px 20px;color:var(--sub)}}
  .back-link{{display:inline-block;margin-top:20px;font-size:13px;color:var(--ok);text-decoration:none;font-weight:600}}
  .back-link:hover{{text-decoration:underline}}
</style>
</head>
<body>
<div class="wrap">
  <h1>👥 신규 가입자 승인</h1>
  <p class="sub">관리자만 접근 가능한 기능입니다.</p>

  {'<div class="user-list">' if pending_users else ''}
  {''.join(f'''<div class="user-card">
    <div class="user-info">
      <div class="user-name">{u["name"]}</div>
      <div class="user-phone">{u["phone"]}</div>
      <div class="user-date">{u["created_at"].split("T")[0]}</div>
    </div>
    <div class="actions">
      <button class="btn-approve" onclick="approve({u["id"]})">승인</button>
      <button class="btn-reject" onclick="reject({u["id"]})">거부</button>
    </div>
  </div>''' for u in pending_users)}
  {'</div>' if pending_users else ''}

  {'' if pending_users else '<div class="empty">승인 대기 중인 사용자가 없습니다.</div>'}

  <a class="back-link" href="/admin">← 관리자 대시보드</a>
</div>

<script>
function approve(userId) {{
  if (confirm('이 사용자를 승인하시겠습니까?')) {{
    fetch('/api/admin/approve', {{
      method: 'POST',
      headers: {{'Content-Type': 'application/json'}},
      body: JSON.stringify({{user_id: userId}})
    }}).then(r => r.json()).then(data => {{
      if (data.success) {{
        location.reload();
      }} else {{
        alert('오류: ' + (data.error || '알 수 없는 오류'));
      }}
    }});
  }}
}}

function reject(userId) {{
  if (confirm('이 사용자의 가입을 거부하시겠습니까?')) {{
    fetch('/api/admin/reject', {{
      method: 'POST',
      headers: {{'Content-Type': 'application/json'}},
      body: JSON.stringify({{user_id: userId}})
    }}).then(r => r.json()).then(data => {{
      if (data.success) {{
        location.reload();
      }} else {{
        alert('오류: ' + (data.error || '알 수 없는 오류'));
      }}
    }});
  }}
}}
</script>
</body>
</html>"""
    return html


@app.route("/api/admin/approve", methods=["POST"])
@admin_required
def api_admin_approve():
    """신규 가입자 승인 API"""
    user = current_user()
    if not user or user["role"] != "admin":
        return jsonify({"success": False, "error": "권한 없음"}), 403

    data = request.get_json() or {}
    user_id = data.get("user_id")

    if not user_id:
        return jsonify({"success": False, "error": "user_id 필수"}), 400

    if storage.approve_user(user_id):
        return jsonify({"success": True})
    else:
        return jsonify({"success": False, "error": "사용자를 찾을 수 없습니다"}), 404


@app.route("/api/admin/reject", methods=["POST"])
@admin_required
def api_admin_reject():
    """신규 가입자 거부 API"""
    user = current_user()
    if not user or user["role"] != "admin":
        return jsonify({"success": False, "error": "권한 없음"}), 403

    data = request.get_json() or {}
    user_id = data.get("user_id")

    if not user_id:
        return jsonify({"success": False, "error": "user_id 필수"}), 400

    if storage.reject_user(user_id):
        return jsonify({"success": True})
    else:
        return jsonify({"success": False, "error": "사용자를 찾을 수 없습니다"}), 404


@app.route("/admin/init-db", methods=["GET", "POST"])
@admin_required
def admin_init_db():
    user = current_user()

    if request.method == "GET":
        html = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="data:image/svg+xml,<svg%20xmlns='http%3A//www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'><path%20d='M4%2021%20A16%2015%200%200%201%2036%2021%20Z'%20fill='%2310233F'/><rect%20x='9'%20y='21'%20width='4.4'%20height='6'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='17.8'%20y='21'%20width='4.4'%20height='10'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='26.6'%20y='21'%20width='4.4'%20height='14'%20rx='1.6'%20fill='%231D5BD8'/></svg>">
<title>데이터베이스 초기화</title>
<style>
  :root{{--ink:#10233F;--paper:#F6F7F9;--card:#FFFFFF;--line:#E3E7EE;--sub:#5B6B82;--ok:#1D5BD8;--gap:#C93030}}
  *{{box-sizing:border-box}}
  body{{font-family:-apple-system,"Pretendard",sans-serif;background:var(--paper);color:var(--ink);margin:0;padding:64px 20px;line-height:1.6}}
  .wrap{{max-width:400px;margin:0 auto}}
  h1{{font-size:22px;margin-bottom:6px}}
  p.sub{{color:var(--sub);font-size:13.5px;margin-bottom:26px;line-height:1.6}}
  .warn{{background:#FBEDED;border:1px solid #F0CDCD;color:var(--gap);padding:14px 16px;border-radius:8px;margin-bottom:24px;font-size:13.5px;line-height:1.6}}
  .buttons{{display:flex;gap:10px;margin-top:20px}}
  button{{flex:1;padding:12px 16px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s}}
  .btn-cancel{{background:var(--line);color:var(--ink)}}
  .btn-cancel:hover{{background:#D3D9E4}}
  .btn-delete{{background:var(--gap);color:#FFFFFF}}
  .btn-delete:hover{{opacity:0.9}}
  a{{display:inline-block;margin-top:20px;color:var(--sub);font-size:13.5px;font-weight:600}}
</style>
</head>
<body>
<div class="wrap">
  <h1>🔑 데이터베이스 초기화</h1>
  <p class="sub">관리자만 접근 가능한 기능입니다.</p>

  <div class="warn">
    ⚠️ 주의: 이 작업은 되돌릴 수 없습니다.<br>
    <strong>모든 사용자 계정과 리포트가 삭제</strong>됩니다.
  </div>

  <form method="post">
    <input type="hidden" name="_csrf_token" value="{_get_csrf_token()}">
    <div class="buttons">
      <button type="button" class="btn-cancel" onclick="history.back()">취소</button>
      <button type="submit" class="btn-delete">모두 삭제</button>
    </div>
  </form>

  <a href="/admin">← 관리자 대시보드</a>
</div>
</body>
</html>"""
        return render_template_string(html)

    if not _check_csrf_token():
        abort(403)

    try:
        storage.clear_all_data()
        success_html = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="data:image/svg+xml,<svg%20xmlns='http%3A//www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'><path%20d='M4%2021%20A16%2015%200%200%201%2036%2021%20Z'%20fill='%2310233F'/><rect%20x='9'%20y='21'%20width='4.4'%20height='6'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='17.8'%20y='21'%20width='4.4'%20height='10'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='26.6'%20y='21'%20width='4.4'%20height='14'%20rx='1.6'%20fill='%231D5BD8'/></svg>">
<title>초기화 완료</title>
<style>
  :root{{--ink:#10233F;--paper:#F6F7F9;--card:#FFFFFF;--line:#E3E7EE;--sub:#5B6B82;--ok:#1D5BD8}}
  *{{box-sizing:border-box}}
  body{{font-family:-apple-system,"Pretendard",sans-serif;background:var(--paper);color:var(--ink);margin:0;padding:64px 20px;line-height:1.6}}
  .wrap{{max-width:400px;margin:0 auto}}
  h1{{font-size:22px;margin-bottom:6px}}
  p{{color:var(--sub);font-size:13.5px;margin-bottom:26px}}
  .success{{background:#EAFAF1;border:1px solid #C6F6D5;color:#22543D;padding:14px 16px;border-radius:8px;margin-bottom:24px;font-size:13.5px}}
  a{{display:inline-block;color:var(--ok);font-size:13.5px;font-weight:600}}
</style>
</head>
<body>
<div class="wrap">
  <h1>✓ 초기화 완료</h1>
  <p>모든 사용자 계정과 리포트가 삭제되었습니다.</p>

  <div class="success">
    데이터베이스가 초기 상태로 복원되었습니다.<br>
    이제 사용자들이 새로 가입할 수 있습니다.
  </div>

  <a href="/admin">← 관리자 대시보드로 돌아가기</a>
</div>
</body>
</html>"""
        return success_html
    except Exception as e:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        return render_template(
            "error.html.j2",
            message=f"데이터베이스 초기화 중 오류: {e}"
        ), 500



@app.errorhandler(500)
def handle_500(e):
    import traceback

    traceback.print_exc()
    original = getattr(e, "original_exception", None) or e
    return render_template("error.html.j2", message=str(original) or "알 수 없는 오류"), 500


IMAGES_DIR = os.path.join(os.path.dirname(__file__), "static", "images")


@app.route("/upload-images", methods=["GET", "POST"])
def upload_images():
    if request.method == "GET":
        return render_template_string("""
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>이미지 업로드</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto; background: #f5f5f5; }
        .container { max-width: 600px; margin: 60px auto; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        h1 { font-size: 24px; margin-bottom: 8px; color: #10233F; }
        .subtitle { color: #666; margin-bottom: 32px; font-size: 14px; }
        .upload-zone { border: 2px dashed #ddd; border-radius: 8px; padding: 40px; text-align: center; cursor: pointer; transition: all 0.2s; }
        .upload-zone:hover { border-color: #4A90FF; background: #f9faff; }
        .upload-zone.dragover { border-color: #4A90FF; background: #f0f4ff; }
        .upload-icon { font-size: 48px; margin-bottom: 16px; }
        .upload-text { color: #666; margin-bottom: 8px; }
        .upload-hint { font-size: 12px; color: #999; }
        input[type="file"] { display: none; }
        .button-group { margin-top: 24px; display: flex; gap: 12px; }
        button { flex: 1; padding: 12px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-primary { background: #4A90FF; color: white; }
        .btn-primary:hover { background: #3a7ee6; }
        .btn-secondary { background: #f0f0f0; color: #333; }
        .btn-secondary:hover { background: #e0e0e0; }
        .status { margin-top: 24px; padding: 16px; border-radius: 6px; display: none; }
        .status.success { background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; }
        .status.error { background: #ffebee; color: #c62828; border: 1px solid #ffcdd2; }
        .file-list { margin-top: 24px; }
        .file-item { padding: 12px; background: #f9f9f9; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
        .file-item .filename { color: #333; font-weight: 500; }
        .file-item .size { color: #999; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🖼️ 이미지 업로드</h1>
        <div class="subtitle">frontpage.png와 toss-logo.png를 업로드하세요</div>

        <form id="uploadForm" enctype="multipart/form-data">
            <div class="upload-zone" id="uploadZone">
                <div class="upload-icon">📁</div>
                <div class="upload-text">파일을 드래그하거나 클릭해서 선택</div>
                <div class="upload-hint">PNG 이미지만 지원 (최대 10MB)</div>
                <input type="file" id="fileInput" name="files" multiple accept=".png">
            </div>

            <div class="file-list" id="fileList"></div>

            <div class="button-group">
                <button type="button" class="btn-secondary" onclick="document.getElementById('fileInput').click()">파일 선택</button>
                <button type="submit" class="btn-primary">업로드</button>
            </div>
        </form>

        <div id="status" class="status"></div>
    </div>

    <script>
        const uploadZone = document.getElementById('uploadZone');
        const fileInput = document.getElementById('fileInput');
        const uploadForm = document.getElementById('uploadForm');
        const fileList = document.getElementById('fileList');
        const status = document.getElementById('status');
        let selectedFiles = [];

        uploadZone.addEventListener('click', () => fileInput.click());

        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            fileInput.files = e.dataTransfer.files;
            updateFileList();
        });

        fileInput.addEventListener('change', updateFileList);

        function updateFileList() {
            selectedFiles = Array.from(fileInput.files);
            fileList.innerHTML = selectedFiles.map(f => `
                <div class="file-item">
                    <span class="filename">📄 ${f.name}</span>
                    <span class="size">${(f.size / 1024).toFixed(1)} KB</span>
                </div>
            `).join('');
        }

        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (selectedFiles.length === 0) {
                showStatus('파일을 선택해주세요', 'error');
                return;
            }

            const formData = new FormData();
            selectedFiles.forEach(f => formData.append('files', f));

            const btn = uploadForm.querySelector('[type="submit"]');
            btn.disabled = true;
            btn.textContent = '업로드 중...';

            try {
                const response = await fetch('/upload-images', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (response.ok) {
                    showStatus('✅ ' + data.message, 'success');
                    setTimeout(() => {
                        showStatus('페이지를 새로고침하세요', 'success');
                    }, 1000);
                } else {
                    showStatus('❌ ' + data.error, 'error');
                }
            } catch (err) {
                showStatus('❌ 업로드 실패: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '업로드';
            }
        });

        function showStatus(message, type) {
            status.textContent = message;
            status.className = `status ${type}`;
            status.style.display = 'block';
        }
    </script>
</body>
</html>
        """)

    # POST: 파일 저장
    if "files" not in request.files:
        return jsonify({"error": "파일을 선택해주세요"}), 400

    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "파일을 선택해주세요"}), 400

    os.makedirs(IMAGES_DIR, exist_ok=True)
    saved_files = []

    for file in files:
        if not file.filename or not file.filename.lower().endswith(".png"):
            continue

        filename = secure_filename(file.filename)
        filepath = os.path.join(IMAGES_DIR, filename)
        file.save(filepath)
        saved_files.append(filename)

    if not saved_files:
        return jsonify({"error": "PNG 파일을 선택해주세요"}), 400

    try:
        os.chdir(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        subprocess.run(["git", "add", "guarantee_report/static/images/"], check=True, capture_output=True)
        subprocess.run([
            "git", "commit", "-m",
            f"Add images: {', '.join(saved_files)}"
        ], check=True, capture_output=True)
        subprocess.run(["git", "push", "-u", "origin", "claude/guarantee-analysis-html-report-ouk5ho"], check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"Git 업로드 실패: {e.stderr.decode()}"}), 500

    return jsonify({
        "message": f"{len(saved_files)}개 이미지가 업로드되었습니다: {', '.join(saved_files)}"
    })


def main():
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    main()
