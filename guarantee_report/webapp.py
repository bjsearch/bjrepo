"""
보장분석 PDF 업로드 → HTML 리포트 생성 웹 앱.

주의: 업로드되는 PDF에는 이름 · 주민등록번호 일부 · 보험 가입내역 등 민감한 개인(신용)정보가
포함됩니다. 업로드된 파일은 처리 즉시 메모리에서만 다루고 디스크에 영구 저장하지 않으며,
요청 종료 시 임시 파일을 삭제합니다.

인증: 환경변수 APP_PASSWORD를 설정하면 HTTP Basic Auth로 전체 사이트가 보호됩니다.
설정하지 않으면(로컬 개발 편의를 위해) 인증 없이 열려 있으니, 외부에 공개 배포할 때는
반드시 APP_PASSWORD를 설정하세요.
"""
from __future__ import annotations

import hmac
import os
import tempfile
from urllib.parse import quote

from flask import Flask, request, render_template_string, Response

from .builder import build_report_data
from .parser import ReportParseError, parse_pdf
from .render import render_html

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20MB

APP_USERNAME = os.environ.get("APP_USERNAME", "admin")
APP_PASSWORD = os.environ.get("APP_PASSWORD")

if not APP_PASSWORD:
    print(
        "[경고] APP_PASSWORD 환경변수가 설정되지 않아 인증 없이 열려 있습니다. "
        "외부에 배포할 때는 반드시 설정하세요.",
        flush=True,
    )


def _auth_ok(auth) -> bool:
    if not auth:
        return False
    return hmac.compare_digest(auth.username or "", APP_USERNAME) and hmac.compare_digest(
        auth.password or "", APP_PASSWORD
    )


@app.before_request
def _require_auth():
    if not APP_PASSWORD:
        return None  # 인증 비활성화 (로컬 개발용)
    if not _auth_ok(request.authorization):
        return Response(
            "인증이 필요합니다.",
            401,
            {"WWW-Authenticate": 'Basic realm="Guarantee Report Generator"'},
        )
    return None

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
  body{font-family:-apple-system,"Pretendard",sans-serif;background:var(--paper);color:var(--ink);margin:0;padding:48px 20px;line-height:1.6}
  .wrap{max-width:520px;margin:0 auto}
  h1{font-size:24px;margin-bottom:6px}
  p.sub{color:var(--sub);font-size:14px;margin-bottom:28px}
  .drop{background:var(--card);border:2px dashed var(--line);border-radius:14px;padding:40px 24px;text-align:center;cursor:pointer;transition:border-color .15s}
  .drop.drag{border-color:var(--ok)}
  .drop input{display:none}
  .drop .hint{color:var(--sub);font-size:13px;margin-top:8px}
  .filename{margin-top:14px;font-size:13.5px;font-weight:600}
  button{margin-top:20px;width:100%;padding:13px;border:none;border-radius:8px;background:var(--ink);color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  button:disabled{opacity:.4;cursor:not-allowed}
  .err{margin-top:16px;padding:12px 16px;background:#FBEDED;color:var(--gap);border-radius:8px;font-size:13.5px}
  .note{margin-top:28px;font-size:12px;color:var(--sub);line-height:1.7}
</style>
</head>
<body>
<div class="wrap">
  <h1>보장분석 리포트 생성기</h1>
  <p class="sub">신용정보원 '보험신용정보 통합조회 결과서' PDF를 업로드하면 같은 디자인의 HTML 리포트를 생성합니다.</p>

  {% if error %}<div class="err">{{ error }}</div>{% endif %}

  <form action="/generate" method="post" enctype="multipart/form-data" id="f">
    <label class="drop" id="drop">
      <input type="file" name="pdf" accept="application/pdf" id="file" required>
      <div id="label">PDF 파일을 여기로 끌어놓거나 클릭해서 선택하세요</div>
      <div class="hint">보험신용정보 통합조회 결과서 (.pdf) · 최대 20MB</div>
      <div class="filename" id="fname"></div>
    </label>
    <button type="submit">HTML 리포트 생성</button>
  </form>

  <div class="note">
    업로드한 PDF는 리포트 생성 즉시 폐기되며 서버에 저장되지 않습니다. 민감한 개인정보가 포함된
    파일이므로 신뢰된 네트워크에서만 사용하세요.
  </div>
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
</script>
</body>
</html>
"""


@app.get("/")
def index():
    return render_template_string(UPLOAD_PAGE, error=None)


@app.post("/generate")
def generate():
    f = request.files.get("pdf")
    if not f or not f.filename:
        return render_template_string(UPLOAD_PAGE, error="PDF 파일을 선택해주세요."), 400
    if not f.filename.lower().endswith(".pdf"):
        return render_template_string(UPLOAD_PAGE, error="PDF 파일만 업로드할 수 있습니다."), 400

    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
        with os.fdopen(fd, "wb") as tmp:
            f.save(tmp)

        parsed = parse_pdf(tmp_path)
        data = build_report_data(parsed)
        html = render_html(data)
    except ReportParseError as e:
        return render_template_string(UPLOAD_PAGE, error=str(e)), 400
    except Exception as e:  # noqa: BLE001 — 사용자에게 원인 안내
        return render_template_string(UPLOAD_PAGE, error=f"리포트 생성 중 오류가 발생했습니다: {e}"), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

    filename = f"{parsed.customer.name}_보장분석리포트.html"
    resp = Response(html, mimetype="text/html")
    # 한글 파일명은 latin-1 헤더 인코딩을 통과하지 못하므로 RFC 5987 인코딩 사용
    resp.headers["Content-Disposition"] = f"inline; filename*=UTF-8''{quote(filename)}"
    return resp


def main():
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    main()
