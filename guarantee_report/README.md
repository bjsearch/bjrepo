# 보장분석 리포트 생성기

신용정보원에서 발급하는 **'보험신용정보 통합조회 결과서'** PDF(실손/정액 보장분석 원본)를
입력받아, 참고 리포트(배갑숙님 보장분석 리포트)와 같은 디자인의 HTML 보장분석 리포트를
자동으로 생성합니다.

## 구조

공통 디자인(레이아웃·CSS)과 고객 데이터를 분리했습니다.

```
guarantee_report/
  parser.py            PDF → 구조화된 원본 데이터 (고객정보/실손담보/정액담보 합계/상세내역)
  brands.py             보험사 브랜드 컬러 · 로고 · 업권(생보/손보/공제) 매핑
  rules.py, rules_default.json
                         권장 보장금액 체크리스트 & 충족도(적정/주의/부족/미가입) 판정 엔진
  builder.py            위 데이터를 리포트 JSON 스키마(헤더/KPI/계약카드/보장표/매트릭스/인사이트)로 조립
  templates/report.html.j2
                         공통 디자인 템플릿 (Jinja2) — 고객이 바뀌어도 이 파일은 그대로
  render.py             JSON 데이터 + 템플릿 → 최종 HTML
  cli.py                커맨드라인 진입점
  webapp.py             파일 업로드 → 브라우저에서 바로 리포트 생성하는 Flask 웹앱
```

데이터 흐름: `PDF → parser → builder(+rules) → JSON → render(+template) → HTML`

## 설치

```bash
pip install -r guarantee_report/requirements.txt
```

## CLI 사용법

```bash
# PDF에서 바로 HTML 리포트 생성
python -m guarantee_report.cli 보장분석.pdf -o report.html

# 중간 데이터를 JSON으로 추출 (설계사가 검수/수정 후 최종 렌더링에 사용)
python -m guarantee_report.cli 보장분석.pdf --json-out data.json

# 검수/수정한 JSON으로 최종 HTML만 재생성 (템플릿만 재사용, PDF 재파싱 없음)
python -m guarantee_report.cli --from-json data.json -o report.html

# 권장 보장금액 체크리스트를 커스텀 파일로 교체
python -m guarantee_report.cli 보장분석.pdf -o report.html --rules my_rules.json
```

## 웹 앱

```bash
python -m guarantee_report.webapp        # http://localhost:5000
# 또는 포트 지정
PORT=8080 python -m guarantee_report.webapp
```

PDF를 드래그 앤 드롭하면 즉시 HTML 리포트가 브라우저에 렌더링됩니다. 업로드된 PDF는
처리 직후 삭제되며 디스크에 영구 저장하지 않습니다.

### 비밀번호 보호

민감한 개인(신용)정보가 포함되므로, 외부에 배포할 때는 `APP_PASSWORD` 환경변수를 반드시
설정하세요. 설정하면 사이트 전체가 HTTP Basic Auth로 보호됩니다 (브라우저 기본 로그인 창).

```bash
APP_USERNAME=admin APP_PASSWORD=원하는비밀번호 python -m guarantee_report.webapp
```

`APP_PASSWORD`를 설정하지 않으면 로컬 개발 편의를 위해 인증 없이 열립니다 — 이 상태로는
외부에 공개 배포하지 마세요.

### Render 배포

저장소 루트의 `render.yaml`로 배포합니다. render.com에서 "New → Blueprint"로 이
저장소를 연결하면, 빌드/실행 명령이 자동으로 설정되고 `APP_PASSWORD` 값을 입력하는
칸이 나타납니다 (레포에는 저장되지 않는 비밀값). 원하는 비밀번호를 입력하고 배포하세요.

## 권장 보장금액 체크리스트 커스터마이즈

`rules_default.json`에 영역별(사망/암/뇌·심장/수술입원/실손) 권장 보장금액과 매칭 규칙이
정의되어 있습니다. 설계사의 기준에 맞게 이 파일을 복사해 수정한 뒤 `--rules` 옵션으로
지정하면 됩니다.

## 한계 및 참고사항

- 입력 PDF는 신용정보원이 발급하는 표준 "보험신용정보 통합조회 결과서" 형식(실손보상담보
  조회 내역 / 정액담보계약정보조회 내역 / 상세내역 3단 구조)만 지원합니다. 다른 형식의
  보장분석 PDF는 지원하지 않습니다.
- 섹션 04 "핵심 진단 및 제언"과 섹션 01 하단 "보완 추천"은 파싱된 데이터(만기 임박 계약,
  미가입 항목, 사망보장 편중 등)를 기반으로 규칙 기반 자동 생성됩니다. 실제 고객 상담
  전에는 설계사가 내용을 검수하는 것을 권장합니다.
- 참고 디자인은 첨부된 배갑숙님 리포트 1건을 기준으로 템플릿화했습니다.
