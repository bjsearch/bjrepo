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
from collections import Counter
from functools import wraps
from urllib.parse import quote

from flask import Flask, request, render_template_string, Response, redirect, url_for, abort, session

from . import storage
from .builder import build_report_data
from .compare import build_comparison
from .parser import ReportParseError, parse_pdf
from .render import render_html, render_template

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20MB
try:
    storage.init_db()
except Exception as e:  # noqa: BLE001 — DB가 기동 시점에 잠깐 응답 없어도 앱 자체는 떠야 함
    print(
        f"[경고] 시작 시 DB 초기화에 실패했습니다 (DB가 깨어나는 중이면 곧 자동 복구됩니다): {e}",
        flush=True,
    )

TEAM_PASSWORD = os.environ.get("APP_PASSWORD")
ADMIN_PHONES = {re.sub(r"\D", "", p) for p in os.environ.get("ADMIN_PHONES", "").split(",") if p.strip()}

_secret = os.environ.get("SECRET_KEY")
if not _secret:
    _secret = secrets.token_hex(32)
    print(
        "[경고] SECRET_KEY 환경변수가 없어 임시 키로 세션을 서명합니다. "
        "재배포/재시작마다 로그인이 풀립니다. 배포 시 SECRET_KEY를 설정하세요.",
        flush=True,
    )
app.secret_key = _secret

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
    if request.endpoint in ("login", "logout", "static"):
        return None
    if not current_user():
        return redirect(url_for("login", next=request.path))
    return None


NAV_CSS = """
  .navbar{display:flex;justify-content:flex-end;align-items:center;gap:14px;max-width:920px;margin:0 auto 8px;padding:0 20px;font-size:13px;color:var(--sub)}
  .navbar a{color:var(--sub);text-decoration:none;font-weight:600}
  .navbar a.admin{color:var(--ok)}
  .navbar form{display:inline}
  .navbar button.linklike{background:none;border:none;color:var(--sub);font:inherit;cursor:pointer;padding:0;font-weight:600}
"""

LOGIN_PAGE = """
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
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
</style>
</head>
<body>
<div class="wrap">
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

UPLOAD_PAGE = """
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
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
  .overlay{position:fixed;inset:0;background:rgba(16,35,63,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:50;opacity:0;pointer-events:none;transition:opacity .2s}
  .overlay.show{opacity:1;pointer-events:all}
  .spinner{width:42px;height:42px;border:4px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .overlay .status{color:#fff;font-size:15px;font-weight:600;min-height:20px}
  .overlay .bar{width:220px;height:6px;background:rgba(255,255,255,.2);border-radius:99px;overflow:hidden}
  .overlay .bar .fill{height:100%;width:0%;background:#fff;border-radius:99px;transition:width .5s ease}
  .overlay .hint2{color:rgba(255,255,255,.6);font-size:12px}
</style>
</head>
<body>
<div class="navbar">
  <span>{{ user.name }}님{% if user.role == 'admin' %} · 관리자{% endif %}</span>
  {% if user.role == 'admin' %}<a class="admin" href="/admin">관리자 화면</a>{% endif %}
  <a href="/reports">저장된 리포트</a>
  <form method="post" action="/logout"><button type="submit" class="linklike">로그아웃</button></form>
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
  <div class="spinner"></div>
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


@app.post("/logout")
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

    report_id = storage.save_report(data, created_by_user_id=user["id"], created_by_name=user["name"])
    return redirect(url_for("view_report", report_id=report_id))


@app.get("/reports")
def reports_list():
    user = current_user()
    reports = storage.list_reports() if user["role"] == "admin" else storage.list_reports(created_by_user_id=user["id"])
    return render_template("reports_list.html.j2", reports=reports, user=user)


def _can_access(meta: dict, user: dict) -> bool:
    return user["role"] == "admin" or meta.get("created_by_user_id") == user["id"]


@app.get("/reports/<int:report_id>")
def view_report(report_id: int):
    user = current_user()
    meta = storage.get_report_meta(report_id)
    if not meta:
        abort(404)
    if not _can_access(meta, user):
        abort(403)
    data = storage.get_report(report_id)
    html = render_html(data)
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
