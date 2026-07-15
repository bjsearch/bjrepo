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
  guidelines/insurance_guideline.md
                         참고 보험 가이드라인 원문 정리 (사람이 읽는 문서)
  guideline_notes.json  위 가이드라인에서 뽑은 실제 치료비 등 참고 문구 (기계가 읽는 요약,
                         rules.py가 로드해 해당 보장 항목에 ⓘ 툴팁으로 붙임)
  builder.py            위 데이터를 리포트 JSON 스키마(헤더/KPI/계약카드/보장표/매트릭스/인사이트)로 조립
  templates/report.html.j2
                         공통 디자인 템플릿 (Jinja2) — 고객이 바뀌어도 이 파일은 그대로
  render.py             JSON 데이터 + 템플릿 → 최종 HTML
  storage.py             생성된 리포트 · 사용자 계정을 저장/조회/삭제하는 영속화 계층
  compare.py             저장된 리포트 여러 건을 같은 체크리스트로 나란히 비교하는 데이터 조립
  templates/reports_list.html.j2, templates/compare.html.j2
                         저장 목록 · 비교 화면 템플릿
  cli.py                커맨드라인 진입점
  webapp.py             파일 업로드 → 브라우저에서 바로 리포트를 생성·저장·비교하는 Flask 웹앱
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

### 로그인 · 관리자 권한

첫 화면은 로그인 페이지입니다. **이름 + 휴대폰번호**를 입력하면 로그인되고(처음이면 자동으로
계정 생성), 세션 쿠키로 유지됩니다. 비밀번호 계정이 아니라 "누가 썼는지 식별"하는 용도라
아래 두 환경변수와 함께 쓰는 것을 전제로 합니다.

- **`APP_PASSWORD`**: 설정하면 로그인 폼에 "팀 비밀번호" 입력칸이 추가됩니다. 이걸 모르면
  이름/휴대폰번호를 알아도 로그인 자체가 안 되므로, 외부인 접근을 막는 1차 방어선입니다.
  민감한 개인(신용)정보를 다루는 만큼 **외부에 배포할 때는 반드시 설정하세요.**
- **`ADMIN_PHONES`**: 관리자 권한을 줄 휴대폰번호를 쉼표로 나열합니다
  (예: `ADMIN_PHONES=01011112222,01033334444`). 여기 등록된 번호로 로그인하면 자동으로
  관리자가 되어 `/admin`에서 **모든 사용자의 저장된 리포트**와 통계를 볼 수 있습니다.
  일반 사용자는 자신이 만든 리포트만 `/reports`에서 볼 수 있습니다.
- **`SECRET_KEY`**: 세션 쿠키 서명에 쓰는 키입니다. 설정하지 않으면 서버가 뜰 때마다 임시
  키를 새로 만들어서, 재배포/재시작할 때마다 모든 로그인이 풀립니다. 배포 시 아무 랜덤
  문자열로 설정해두세요 (Render Blueprint는 자동으로 생성해줍니다).

전화번호는 실제 비밀번호가 아니라서(동료끼리 알 수 있음) 보안 강도는 낮습니다 —
`APP_PASSWORD`를 반드시 함께 쓰는 걸 전제로 설계했습니다.

```bash
APP_PASSWORD=팀비밀번호 ADMIN_PHONES=01011112222,01033334444 SECRET_KEY=아무랜덤문자열 \
  python -m guarantee_report.webapp
```

### 관리자 화면

`/admin`에서 볼 수 있는 것:
- 전체 리포트 수, 분석한 고객 수, 평균 월 보험료
- 전체 고객 기준 가장 흔한 미가입(보장 공백) 항목 Top 8 — 어떤 보장이 공통적으로 부족한지
  한눈에 파악
- 전체 사용자가 생성한 모든 리포트 목록 (생성자 포함)
- 등록된 사용자 목록 (이름, 휴대폰번호 뒷자리만 마스킹 표시, 권한, 최근 로그인)

### 리포트 저장 · 비교

리포트를 생성하면 자동으로 저장되며, `/reports`에서 저장된 리포트 목록을 볼 수 있습니다.
2건 이상 체크해서 "선택한 항목 비교하기"를 누르면 같은 권장 보장금액 체크리스트 기준으로
고객별 가입금액 · 충족도를 나란히 비교하는 화면(`/compare`)이 열립니다.

저장 백엔드는 `storage.py` 하나에 모여 있고, 아래 두 가지를 자동으로 감지해서 씁니다.

- **`DATABASE_URL`이 설정되어 있으면 → Postgres** (권장, 영구 저장)
- **설정되어 있지 않으면 → 로컬 SQLite 파일** (`DB_PATH`, 기본값 `guarantee_report/reports.db`)

### 카카오톡으로 리포트 보내기

리포트 화면 우측 상단(모바일은 우하단)에 노란색 "카카오톡으로 보내기" 버튼이 있습니다.
누르면 로그인 없이도 볼 수 있는 **공개 공유 링크**(`/s/<임의토큰>`, 예측 불가능한 긴 문자열)를
자동으로 발급하고, 아래 순서로 가장 적합한 방법을 골라 공유합니다.

1. `KAKAO_JS_KEY`가 설정되어 있으면 → 카카오 JS SDK로 카카오톡 공유 카드를 바로 띄움
2. 아니고 모바일 브라우저라면 → OS 기본 공유 시트(`navigator.share`)를 띄움 — 카카오톡이
   설치되어 있으면 그 목록에 나타남
3. 그것도 안 되면(주로 데스크톱) → 링크를 클립보드에 복사하고 카카오톡에 붙여넣으라는
   안내를 표시

**⚠️ 공유 링크는 로그인 없이 아무나 열람할 수 있습니다.** 고객 이름·생년월일·보험 가입내역이
그대로 보이므로, 의도한 상대(그 고객 본인)에게만 전달하세요. 리포트 화면에서 언제든 공유를
중지할 수 있고(`/reports/<id>/unshare`), 다시 공유하면 새 링크가 발급됩니다.

#### 카카오 JS SDK 연동 (선택)

설정하지 않아도 위 2·3번 방식으로 정상 동작합니다. 카카오톡 공식 공유 카드를 쓰고 싶다면:

1. [Kakao Developers](https://developers.kakao.com)에서 애플리케이션 생성
2. "플랫폼" 설정에 배포된 도메인(`https://guarantee-report-xxxx.onrender.com` 등) 등록
3. "앱 키" 중 **JavaScript 키** 복사
4. Render 대시보드 → 서비스 → Environment → `KAKAO_JS_KEY` 값으로 붙여넣기

**⚠️ Render 무료 플랜은 로컬 파일이 영구적이지 않습니다.** 15분간 요청이 없어 슬립했다가
다시 깨어나거나 재배포할 때마다 SQLite 파일이 초기화될 수 있어, 저장된 리포트가 예고 없이
사라질 수 있습니다. 계속 보존하려면 외부 Postgres를 붙이세요.

#### 무료 Postgres 연동 (Neon 예시)

1. [neon.tech](https://neon.tech) 에서 무료 가입 (GitHub 계정으로 바로 가능)
2. "Create a project" → 이름 아무거나 → 리전은 가까운 곳(예: AWS Singapore) 선택 → 생성
3. 프로젝트 대시보드에 뜨는 **Connection string**을 복사
   (`postgresql://사용자:비밀번호@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` 형태)
4. Render 대시보드 → 이미 배포된 서비스(guarantee-report) → **Environment** 탭 →
   "Add Environment Variable" → Key: `DATABASE_URL`, Value: 방금 복사한 연결 문자열 → Save
   (저장하면 자동으로 재배포됩니다)
5. 재배포가 끝나면 앱이 시작할 때 자동으로 테이블을 만들고, 그 이후부터는 슬립/재배포와
   무관하게 리포트가 영구 보존됩니다.

Neon 무료 티어는 미사용 시 컴퓨트가 자동으로 쉬었다가(autosuspend) 다음 요청이 오면 몇 초
안에 자동으로 깨어나며, 데이터는 그대로 유지됩니다 — Render가 슬립하는 상황과 잘 맞습니다.

로컬 개발에서 Postgres를 테스트하려면:
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname python -m guarantee_report.webapp
```
`DATABASE_URL`을 설정하지 않으면 지금까지처럼 SQLite로 자동 동작하니, 로컬 개발은
아무것도 바꾸지 않아도 됩니다.

### Render 배포

저장소 루트의 `render.yaml`로 배포합니다. render.com에서 "New → Blueprint"로 이
저장소를 연결하면, 빌드/실행 명령이 자동으로 설정되고 `APP_PASSWORD`, `DATABASE_URL`,
`ADMIN_PHONES` 값을 입력하는 칸이 나타납니다 (레포에는 저장되지 않는 비밀값).
`SECRET_KEY`는 Render가 자동으로 랜덤 값을 만들어줍니다. `DATABASE_URL`은 비워둬도
배포되며, 그 경우 SQLite로 동작합니다 — 나중에 위 "무료 Postgres 연동" 단계대로
Environment 탭에서 추가해도 됩니다. `ADMIN_PHONES`도 나중에 Environment 탭에서
추가/수정할 수 있습니다.

## 권장 보장금액 체크리스트 커스터마이즈

`rules_default.json`에 영역별(사망/암/뇌·심장/수술입원/실손) 권장 보장금액과 매칭 규칙이
정의되어 있습니다. 설계사의 기준에 맞게 이 파일을 복사해 수정한 뒤 `--rules` 옵션으로
지정하면 됩니다.

## 보험 가이드라인 참고 자료

`guidelines/insurance_guideline.md`는 참고용 보험 가이드라인(범위·크기·기간·보험료
4가지 기준, 암/뇌혈관/심장질환의 진단명 포함 관계, 실제 치료비 벤치마크, 피해야 할 보험
구조)을 정리한 문서입니다. `rules_default.json`의 카테고리 계층(예: 뇌혈관질환 ⊇ 뇌졸중
⊇ 뇌출혈)은 이 문서의 포함 관계를 그대로 반영합니다.

`guideline_notes.json`은 이 문서에서 뽑은 실제 치료비 등 참고 문구를 보장 항목 라벨과
매핑해둔 파일로, `rules.py`가 자동으로 로드해 리포트의 해당 보장 항목 옆에 ⓘ 아이콘
툴팁으로 표시합니다. 새 가이드라인 문서를 추가하려면 `guidelines/`에 md 파일을 추가하고,
필요한 참고 문구를 `guideline_notes.json`의 `notes`에 `"보장 항목 라벨": "문구"` 형태로
추가하면 됩니다 (라벨은 `rules_default.json`의 `label`과 정확히 일치해야 매칭됩니다).

## 한계 및 참고사항

- 입력 PDF는 신용정보원이 발급하는 표준 "보험신용정보 통합조회 결과서" 형식(실손보상담보
  조회 내역 / 정액담보계약정보조회 내역 / 상세내역 3단 구조)만 지원합니다. 다른 형식의
  보장분석 PDF는 지원하지 않습니다.
- 섹션 04 "핵심 진단 및 제언"과 섹션 01 하단 "보완 추천"은 파싱된 데이터(만기 임박 계약,
  미가입 항목, 사망보장 편중 등)를 기반으로 규칙 기반 자동 생성됩니다. 실제 고객 상담
  전에는 설계사가 내용을 검수하는 것을 권장합니다.
- 참고 디자인은 첨부된 배갑숙님 리포트 1건을 기준으로 템플릿화했습니다.
