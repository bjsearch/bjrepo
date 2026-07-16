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
import tempfile
import time
from collections import Counter
from functools import wraps
from urllib.parse import quote

from flask import Flask, request, render_template_string, Response, redirect, url_for, abort, session
from werkzeug.middleware.proxy_fix import ProxyFix

from . import chatbot, storage
from .builder import build_report_data
from .compare import build_comparison
from .parser import ReportParseError, parse_pdf
from .render import render_html, render_template

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20MB
# Render(및 대부분의 PaaS)는 앱 앞단에 리버스 프록시를 두므로, 프록시가 보내는
# X-Forwarded-* 헤더를 신뢰하도록 설정해야 url_for(_external=True)가 내부 바인드
# 주소(예: 127.0.0.1:10000)가 아닌 실제 공개 도메인/https를 반환한다.
# (그렇지 않으면 카카오톡 등으로 공유한 링크의 호스트가 잘못되어 열리지 않는다.)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)
try:
    storage.init_db()
except Exception as e:  # noqa: BLE001 — DB가 기동 시점에 잠깐 응답 없어도 앱 자체는 떠야 함
    print(
        f"[경고] 시작 시 DB 초기화에 실패했습니다 (DB가 깨어나는 중이면 곧 자동 복구됩니다): {e}",
        flush=True,
    )

TEAM_PASSWORD = os.environ.get("APP_PASSWORD")
ADMIN_PHONES = {re.sub(r"\D", "", p) for p in os.environ.get("ADMIN_PHONES", "").split(",") if p.strip()}
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

# 임시 리포트 데이터 캐시 (UUID → 리포트 데이터)
_draft_reports = {}


def _generate_draft_id() -> str:
    """임시 리포트 ID 생성"""
    return secrets.token_urlsafe(16)


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
    if request.endpoint in ("login", "logout", "static", "shared_report", "shared_report_chat"):
        return None
    if not current_user():
        return redirect(url_for("login", next=request.path))
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
LOGIN_PAGE = """
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="data:image/svg+xml,<svg%20xmlns='http%3A//www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'><path%20d='M4%2021%20A16%2015%200%200%201%2036%2021%20Z'%20fill='%2310233F'/><rect%20x='9'%20y='21'%20width='4.4'%20height='6'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='17.8'%20y='21'%20width='4.4'%20height='10'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='26.6'%20y='21'%20width='4.4'%20height='14'%20rx='1.6'%20fill='%231D5BD8'/></svg>">
<title>로그인 — 보장분석 리포트 생성기</title>
<style>
  :root{--ink:#10233F;--paper:#F6F7F9;--card:#FFFFFF;--line:#E3E7EE;--sub:#5B6B82;--ok:#1D5BD8;--gap:#C93030}
  *{box-sizing:border-box}
  body{font-family:-apple-system,"Pretendard",sans-serif;background:var(--paper);color:var(--ink);margin:0;padding:64px 20px;line-height:1.6}
  .wrap{max-width:400px;margin:0 auto}
  h1{font-size:22px;margin-bottom:6px}
  p.sub{color:var(--sub);font-size:13.5px;margin-bottom:26px}
  label{display:block;font-size:13px;font-weight:700;margin:16px 0 6px}
  input{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:8px;font-size:15px;font-family:inherit;background:var(--card);color:var(--ink)}
  input:focus{outline:2px solid var(--ok);outline-offset:-1px}
  button{margin-top:24px;width:100%;padding:13px;border:none;border-radius:8px;background:var(--ink);color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  .err{margin-top:16px;padding:12px 16px;background:#FBEDED;color:var(--gap);border-radius:8px;font-size:13.5px}
  .brand-lockup{display:flex;align-items:center;gap:9px;margin-bottom:22px}
  .brand-lockup .wordmark{font-family:"Noto Serif KR",serif;font-weight:700;font-size:17px;color:var(--ink);letter-spacing:-.01em}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand-lockup">""" + LOGO_MARK + """<span class="wordmark">보장분석</span></div>
  <h1>보장분석 리포트 생성기</h1>
  <p class="sub">이름과 휴대폰번호로 로그인하세요. 처음이면 자동으로 계정이 만들어집니다.</p>
  {% if error %}<div class="err">{{ error }}</div>{% endif %}
  <form method="post" action="/login">
    <input type="hidden" name="next" value="{{ next_url or '' }}">
    <label for="name">이름</label>
    <input type="text" id="name" name="name" required placeholder="홍길동" value="{{ name or '' }}">
    <label for="phone">휴대폰번호</label>
    <input type="tel" id="phone" name="phone" required placeholder="010-1234-5678" value="{{ phone or '' }}">
    {% if need_password %}
    <label for="password">팀 비밀번호</label>
    <input type="password" id="password" name="password" required>
    {% endif %}
    <button type="submit">로그인</button>
  </form>
</div>
<script>
  function formatPhone(digits) {
    digits = digits.slice(0, 11);
    if (digits.startsWith('02')) {
      if (digits.length <= 2) return digits;
      if (digits.length <= 5) return digits.slice(0, 2) + '-' + digits.slice(2);
      if (digits.length <= 9) return digits.slice(0, 2) + '-' + digits.slice(2, 5) + '-' + digits.slice(5);
      return digits.slice(0, 2) + '-' + digits.slice(2, 6) + '-' + digits.slice(6, 10);
    }
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return digits.slice(0, 3) + '-' + digits.slice(3);
    if (digits.length <= 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
    return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
  }
  const phoneInput = document.getElementById('phone');
  phoneInput.addEventListener('input', () => {
    const digits = phoneInput.value.replace(/\\D/g, '');
    phoneInput.value = formatPhone(digits);
  });
</script>
</body>
</html>
"""

SHARE_GATE_PAGE = """
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="data:image/svg+xml,<svg%20xmlns='http%3A//www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'><path%20d='M4%2021%20A16%2015%200%200%201%2036%2021%20Z'%20fill='%2310233F'/><rect%20x='9'%20y='21'%20width='4.4'%20height='6'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='17.8'%20y='21'%20width='4.4'%20height='10'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='26.6'%20y='21'%20width='4.4'%20height='14'%20rx='1.6'%20fill='%231D5BD8'/></svg>">
<title>보장분석 리포트 확인</title>
<style>
  :root{--ink:#10233F;--paper:#F6F7F9;--card:#FFFFFF;--line:#E3E7EE;--sub:#5B6B82;--ok:#1D5BD8;--gap:#C93030}
  *{box-sizing:border-box}
  body{font-family:-apple-system,"Pretendard",sans-serif;background:var(--paper);color:var(--ink);margin:0;padding:64px 20px;line-height:1.6}
  .wrap{max-width:400px;margin:0 auto}
  h1{font-size:20px;margin-bottom:6px}
  p.sub{color:var(--sub);font-size:13.5px;margin-bottom:26px}
  label{display:block;font-size:13px;font-weight:700;margin:16px 0 6px}
  input{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:8px;font-size:15px;font-family:inherit;background:var(--card);color:var(--ink)}
  input:focus{outline:2px solid var(--ok);outline-offset:-1px}
  button{margin-top:24px;width:100%;padding:13px;border:none;border-radius:8px;background:var(--ink);color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  .err{margin-top:16px;padding:12px 16px;background:#FBEDED;color:var(--gap);border-radius:8px;font-size:13.5px}
  .brand-lockup{display:flex;align-items:center;gap:9px;margin-bottom:22px}
  .brand-lockup .wordmark{font-family:"Noto Serif KR",serif;font-weight:700;font-size:17px;color:var(--ink);letter-spacing:-.01em}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand-lockup">""" + LOGO_MARK + """<span class="wordmark">보장분석</span></div>
  <h1>{{ customer_name }}님 보장분석 리포트</h1>
  <p class="sub">본인 확인을 위해 이 리포트를 보내주신 담당자의 휴대폰번호를 입력해주세요.</p>
  {% if error %}<div class="err">{{ error }}</div>{% endif %}
  <form method="post">
    <label for="phone">담당자 휴대폰번호</label>
    <input type="tel" id="phone" name="phone" required placeholder="010-1234-5678" autofocus>
    <button type="submit">확인하고 리포트 보기</button>
  </form>
</div>
<script>
  function formatPhone(digits) {
    digits = digits.slice(0, 11);
    if (digits.startsWith('02')) {
      if (digits.length <= 2) return digits;
      if (digits.length <= 5) return digits.slice(0, 2) + '-' + digits.slice(2);
      if (digits.length <= 9) return digits.slice(0, 2) + '-' + digits.slice(2, 5) + '-' + digits.slice(5);
      return digits.slice(0, 2) + '-' + digits.slice(2, 6) + '-' + digits.slice(6, 10);
    }
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return digits.slice(0, 3) + '-' + digits.slice(3);
    if (digits.length <= 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
    return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
  }
  const phoneInput = document.getElementById('phone');
  phoneInput.addEventListener('input', () => {
    const digits = phoneInput.value.replace(/\\D/g, '');
    phoneInput.value = formatPhone(digits);
  });
</script>
</body>
</html>
"""

UPLOAD_PAGE = """
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="data:image/svg+xml,<svg%20xmlns='http%3A//www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'><path%20d='M4%2021%20A16%2015%200%200%201%2036%2021%20Z'%20fill='%2310233F'/><rect%20x='9'%20y='21'%20width='4.4'%20height='6'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='17.8'%20y='21'%20width='4.4'%20height='10'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='26.6'%20y='21'%20width='4.4'%20height='14'%20rx='1.6'%20fill='%231D5BD8'/></svg>">
<title>보장분석 리포트 생성기</title>
<style>
  :root{--ink:#10233F;--paper:#F6F7F9;--card:#FFFFFF;--line:#E3E7EE;--sub:#5B6B82;--ok:#1D5BD8;--gap:#C93030}
  *{box-sizing:border-box}
  body{font-family:-apple-system,"Pretendard",sans-serif;background:var(--paper);color:var(--ink);margin:0;padding:28px 20px 48px;line-height:1.6}
  .wrap{max-width:520px;margin:0 auto}
  h1{font-size:24px;margin-bottom:6px}
  p.sub{color:var(--sub);font-size:14px;margin-bottom:28px}
  .drop{display:block;background:var(--card);border:2px dashed var(--line);border-radius:14px;padding:40px 24px;text-align:center;cursor:pointer;transition:border-color .15s}
  .drop.drag{border-color:var(--ok)}
  .drop input{display:none}
  .drop .hint{color:var(--sub);font-size:13px;margin-top:8px}
  .filename{margin-top:14px;font-size:13.5px;font-weight:600}
  button{margin-top:20px;width:100%;padding:13px;border:none;border-radius:8px;background:var(--ink);color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  button:disabled{opacity:.4;cursor:not-allowed}
  .err{margin-top:16px;padding:12px 16px;background:#FBEDED;color:var(--gap);border-radius:8px;font-size:13.5px}
  .note{margin-top:28px;font-size:12px;color:var(--sub);line-height:1.7}
""" + NAV_CSS + """
  .overlay{position:fixed;inset:0;background:rgba(16,35,63,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:50;opacity:0;pointer-events:none;transition:opacity .2s}
  .overlay.show{opacity:1;pointer-events:all}
  .scan-card{width:78px;height:96px}
  .scan-card svg{width:100%;height:100%;display:block}
  .scan-line{animation:scanmove 1.9s cubic-bezier(.65,0,.35,1) infinite}
  @keyframes scanmove{0%{transform:translateY(0);opacity:0}8%{opacity:1}92%{opacity:1}100%{transform:translateY(78px);opacity:0}}
  .check-row{display:flex;flex-wrap:wrap;justify-content:center;gap:7px;max-width:280px}
  .check-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:5px 10px;border-radius:99px;background:rgba(255,255,255,.1);color:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.22);animation:checkpop 2.6s ease-in-out infinite;animation-delay:var(--d,0s)}
  @keyframes checkpop{
    0%,12%,100%{background:rgba(255,255,255,.1);color:rgba(255,255,255,.5);border-color:rgba(255,255,255,.22);transform:scale(1)}
    22%,60%{background:#1D5BD8;color:#fff;border-color:#1D5BD8;transform:scale(1.06)}
    72%{background:rgba(255,255,255,.1);color:rgba(255,255,255,.5);border-color:rgba(255,255,255,.22);transform:scale(1)}
  }
  @media (prefers-reduced-motion: reduce){
    .scan-line{animation:none;opacity:.7}
    .check-chip{animation:none}
  }
  .overlay .status{color:#fff;font-size:15px;font-weight:600;min-height:20px}
  .overlay .bar{width:220px;height:6px;background:rgba(255,255,255,.2);border-radius:99px;overflow:hidden}
  .overlay .bar .fill{height:100%;width:0%;background:#fff;border-radius:99px;transition:width .5s ease}
  .overlay .hint2{color:rgba(255,255,255,.6);font-size:12px}
</style>
</head>
<body>
<div class="navbar">
  <div class="brand-group">
    <a class="brand" href="/">""" + LOGO_MARK + """<span class="wordmark">보장분석</span></a>
  </div>
  <div class="menu">
    <span class="who">{{ user.name }}님{% if user.role == 'admin' %} · 관리자{% endif %}</span>
    {% if user.role == 'admin' %}<a class="admin" href="/admin">""" + ICON_DASHBOARD + """관리자 화면</a>{% endif %}
    <a href="/reports">""" + ICON_DOC + """저장된 리포트</a>
    <a href="/logout">""" + ICON_LOGOUT + """로그아웃</a>
  </div>
</div>
<div class="wrap">
  <h1>보장분석 리포트 생성기</h1>
  <p class="sub">신용정보원 '보험신용정보 통합조회 결과서' PDF를 업로드하면 같은 디자인의 HTML 리포트를 생성하고 자동으로 저장합니다.</p>

  {% if error %}<div class="err">{{ error }}</div>{% endif %}

  <form action="/generate" method="post" enctype="multipart/form-data" id="f">
    <label class="drop" id="drop">
      <input type="file" name="pdf" accept="application/pdf" id="file" required>
      <div id="label">PDF 파일을 여기로 끌어놓거나 클릭해서 선택하세요</div>
      <div class="hint">보험신용정보 통합조회 결과서 (.pdf) · 최대 20MB</div>
      <div class="filename" id="fname"></div>
    </label>
    <button type="submit" id="submitBtn">HTML 리포트 생성</button>
  </form>

  <div class="note">
    업로드한 PDF는 리포트 생성 즉시 폐기되며 서버에 저장되지 않습니다. 민감한 개인정보가 포함된
    파일이므로 신뢰된 네트워크에서만 사용하세요.
  </div>
</div>

<div class="overlay" id="overlay">
  <div class="scan-card">
    <svg viewBox="0 0 78 96" aria-hidden="true">
      <defs>
        <linearGradient id="scangrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#4C8DFF" stop-opacity="0"/>
          <stop offset="0.5" stop-color="#4C8DFF" stop-opacity=".95"/>
          <stop offset="1" stop-color="#4C8DFF" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="70" height="88" rx="8" fill="#16294A" stroke="rgba(255,255,255,.18)" stroke-width="2"/>
      <rect x="16" y="20" width="46" height="4.5" rx="2.25" fill="rgba(255,255,255,.25)"/>
      <rect x="16" y="32" width="34" height="4.5" rx="2.25" fill="rgba(255,255,255,.25)"/>
      <rect x="16" y="44" width="40" height="4.5" rx="2.25" fill="rgba(255,255,255,.25)"/>
      <rect x="16" y="56" width="30" height="4.5" rx="2.25" fill="rgba(255,255,255,.25)"/>
      <rect x="16" y="68" width="38" height="4.5" rx="2.25" fill="rgba(255,255,255,.25)"/>
      <rect class="scan-line" x="4" y="4" width="70" height="10" fill="url(#scangrad)"/>
    </svg>
  </div>
  <div class="check-row">
    <span class="check-chip" style="--d:0s">✓ 사망</span>
    <span class="check-chip" style="--d:.5s">✓ 암</span>
    <span class="check-chip" style="--d:1s">✓ 뇌·심장</span>
    <span class="check-chip" style="--d:1.5s">✓ 실손</span>
  </div>
  <div class="status" id="status">PDF 업로드 중...</div>
  <div class="bar"><div class="fill" id="fill"></div></div>
  <div class="hint2">보통 5~20초 정도 걸려요. 창을 닫지 마세요.</div>
</div>

<script>
  const drop = document.getElementById('drop');
  const input = document.getElementById('file');
  const fname = document.getElementById('fname');
  input.addEventListener('change', () => { fname.textContent = input.files[0] ? input.files[0].name : ''; });
  ['dragover','dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => {
    if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; fname.textContent = input.files[0].name; }
  });

  const form = document.getElementById('f');
  const overlay = document.getElementById('overlay');
  const statusEl = document.getElementById('status');
  const fillEl = document.getElementById('fill');
  const submitBtn = document.getElementById('submitBtn');
  const steps = ['PDF 업로드 중...', '보장 항목 표 추출 중...', '보장 매트릭스 계산 중...', '리포트 조립 중...', '거의 다 됐어요...'];

  form.addEventListener('submit', () => {
    if (!input.files.length) return;
    submitBtn.disabled = true;
    submitBtn.textContent = '생성 중...';
    overlay.classList.add('show');
    let stepIdx = 0, progress = 8;
    statusEl.textContent = steps[0];
    fillEl.style.width = progress + '%';
    setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, steps.length - 1);
      statusEl.textContent = steps[stepIdx];
      progress = Math.min(progress + Math.random() * 18 + 10, 92);
      fillEl.style.width = progress + '%';
    }, 1400);
  });
</script>
</body>
</html>
"""


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template_string(
            LOGIN_PAGE, error=None, need_password=bool(TEAM_PASSWORD), next_url=request.args.get("next")
        )

    name = request.form.get("name", "").strip()
    phone_raw = request.form.get("phone", "").strip()
    phone = _normalize_phone(phone_raw)
    password = request.form.get("password", "")
    next_url = request.form.get("next") or url_for("index")

    def _fail(msg, status=400):
        return (
            render_template_string(
                LOGIN_PAGE,
                error=msg,
                need_password=bool(TEAM_PASSWORD),
                next_url=next_url,
                name=name,
                phone=phone_raw,
            ),
            status,
        )

    if not name or len(phone) < 9:
        return _fail("이름과 휴대폰번호를 정확히 입력해주세요.")
    if TEAM_PASSWORD and not hmac.compare_digest(password, TEAM_PASSWORD):
        return _fail("팀 비밀번호가 올바르지 않습니다.", 401)

    role = "admin" if phone in ADMIN_PHONES else "user"
    try:
        user = storage.upsert_user(name, phone, role)
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


@app.get("/")
def index():
    return render_template_string(UPLOAD_PAGE, error=None, user=current_user())


@app.post("/generate")
def generate():
    user = current_user()
    f = request.files.get("pdf")
    if not f or not f.filename:
        return render_template_string(UPLOAD_PAGE, error="PDF 파일을 선택해주세요.", user=user), 400
    if not f.filename.lower().endswith(".pdf"):
        return render_template_string(UPLOAD_PAGE, error="PDF 파일만 업로드할 수 있습니다.", user=user), 400

    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
        with os.fdopen(fd, "wb") as tmp:
            f.save(tmp)

        parsed = parse_pdf(tmp_path)
        data = build_report_data(parsed)
    except ReportParseError as e:
        return render_template_string(UPLOAD_PAGE, error=str(e), user=user), 400
    except Exception as e:  # noqa: BLE001 — 사용자에게 원인 안내
        return render_template_string(UPLOAD_PAGE, error=f"리포트 생성 중 오류가 발생했습니다: {e}", user=user), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

    # 임시 리포트 저장 후 수정 페이지로 이동
    draft_id = _generate_draft_id()
    _draft_reports[draft_id] = {
        "data": data,
        "user_id": user["id"],
        "user_name": user["name"],
        "created_at": time.time(),
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
        recommendations = data.get("recommendations", [])
        insights = data.get("insights", [])
        header = data.get("header", {})

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
h1{{font-size:24px;margin-bottom:28px}}
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

<form method="POST">
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
            urgent_badge = '<span class="urgent-badge">긴급</span>' if insight.get("urgent") else ""
            urgent_checked = "checked" if insight.get("urgent") else ""
            html += f"""
    <div class="item">
      <div class="form-group">
        <label>제목 {urgent_badge}</label>
        <input type="text" name="insight_title_{idx}" value="{insight.get('title', '')}">
      </div>
      <div class="form-group">
        <label>내용</label>
        <textarea name="insight_text_{idx}">{insight.get('text', '')}</textarea>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" name="insight_urgent_{idx}" value="1" {urgent_checked}>
        <label>긴급</label>
      </div>
      <button type="button" class="btn btn-danger" onclick="document.querySelector('[name=insight_deleted_{idx}]').value='1'; this.parentElement.parentElement.style.opacity='0.5'">삭제</button>
      <input type="hidden" name="insight_deleted_{idx}" value="0">
    </div>
"""

        html += f"""
    <div style="margin-top:16px;padding:12px;background:#EDF3FE;border-radius:8px">
      <div class="form-group">
        <label>새 항목 추가 - 제목</label>
        <input type="text" name="new_insight_title" placeholder="새 항목의 제목을 입력하세요">
      </div>
      <div class="form-group">
        <label>내용</label>
        <textarea name="new_insight_text" placeholder="새 항목의 내용을 입력하세요"></textarea>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" name="new_insight_urgent" value="1">
        <label>긴급</label>
      </div>
    </div>
  </div>

  <div class="action-bar">
    <button type="submit" class="btn btn-primary">완성된 리포트 저장</button>
    <button type="button" class="btn btn-secondary" onclick="window.history.back()">취소</button>
  </div>

  <input type="hidden" name="draft_id" value="{draft_id}">
  <input type="hidden" name="insights_count" value="{len(insights)}">
</form>
</div>
</body>
</html>
"""
        return html

    # POST: 수정된 데이터로 최종 저장
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
        if not request.form.get(f"insight_deleted_{idx}"):
            modified_insights.append({
                "title": request.form.get(f"insight_title_{idx}", insights[idx].get("title")),
                "text": request.form.get(f"insight_text_{idx}", insights[idx].get("text")),
                "urgent": bool(request.form.get(f"insight_urgent_{idx}")),
            })

    # 새 항목 추가
    new_title = request.form.get("new_insight_title", "").strip()
    new_text = request.form.get("new_insight_text", "").strip()
    if new_title or new_text:
        modified_insights.append({
            "title": new_title,
            "text": new_text,
            "urgent": bool(request.form.get("new_insight_urgent")),
        })

    # 데이터 업데이트
    data["recommendations"] = modified_recommendations
    data["insights"] = modified_insights

    # DB에 저장
    report_id = storage.save_report(data, created_by_user_id=user["id"], created_by_name=user["name"])

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
            "share_url": _share_url(meta.get("share_token")),
            "is_public_view": False,
            "kakao_js_key": KAKAO_JS_KEY,
            "chat_endpoint": url_for("report_chat", report_id=report_id),
            "chat_enabled": bool(chatbot.ANTHROPIC_API_KEY),
        }
    )
    filename = f"{data['header']['name']}_보장분석리포트.html"
    resp = Response(html, mimetype="text/html")
    # 한글 파일명은 latin-1 헤더 인코딩을 통과하지 못하므로 RFC 5987 인코딩 사용
    resp.headers["Content-Disposition"] = f"inline; filename*=UTF-8''{quote(filename)}"
    return resp


@app.post("/reports/<int:report_id>/delete")
def delete_report(report_id: int):
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if meta and _can_access(meta, user):
        storage.delete_report(report_id)
    return redirect(url_for("reports_list"))


@app.post("/reports/<int:report_id>/share")
def create_share_link(report_id: int):
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
            return render_template_string(
                SHARE_GATE_PAGE, error=error, customer_name=data["header"]["name"]
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

    return render_template(
        "admin.html.j2",
        user=current_user(),
        total_reports=total_reports,
        total_customers=total_customers,
        avg_premium=avg_premium,
        top_gaps=top_gaps,
        reports=storage.list_reports(),
        users=users,
    )


ERROR_PAGE = """
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="data:image/svg+xml,<svg%20xmlns='http%3A//www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'><path%20d='M4%2021%20A16%2015%200%200%201%2036%2021%20Z'%20fill='%2310233F'/><rect%20x='9'%20y='21'%20width='4.4'%20height='6'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='17.8'%20y='21'%20width='4.4'%20height='10'%20rx='1.6'%20fill='%231D5BD8'/><rect%20x='26.6'%20y='21'%20width='4.4'%20height='14'%20rx='1.6'%20fill='%231D5BD8'/></svg>">
<title>오류 — 보장분석 리포트 생성기</title>
<style>
  :root{--ink:#10233F;--paper:#F6F7F9;--card:#FFFFFF;--line:#E3E7EE;--sub:#5B6B82;--gap:#C93030}
  *{box-sizing:border-box}
  body{font-family:-apple-system,"Pretendard",sans-serif;background:var(--paper);color:var(--ink);margin:0;padding:64px 20px;line-height:1.6}
  .wrap{max-width:520px;margin:0 auto}
  h1{font-size:20px;margin-bottom:14px}
  .err{padding:14px 16px;background:#FBEDED;color:var(--gap);border-radius:8px;font-size:13.5px;word-break:break-all}
  a{display:inline-block;margin-top:20px;color:var(--sub);font-size:13.5px;font-weight:600}
</style>
</head>
<body>
<div class="wrap">
  <h1>일시적인 오류가 발생했습니다</h1>
  <div class="err">{{ message }}</div>
  <a href="/">← 처음으로</a>
</div>
</body>
</html>
"""


@app.errorhandler(500)
def handle_500(e):
    import traceback

    traceback.print_exc()
    original = getattr(e, "original_exception", None) or e
    return render_template_string(ERROR_PAGE, message=str(original) or "알 수 없는 오류"), 500


def main():
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    main()
