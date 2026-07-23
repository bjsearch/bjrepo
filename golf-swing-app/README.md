# 골프 스윙 분석기 (Golf Swing Analyzer)

스윙 영상을 업로드하고 사용한 클럽(드라이버 / 아이언 번호 / 웻지 각도)을 선택하면,
AI가 영상에서 추출한 프레임을 분석하여 다음을 제공합니다.

- 스윙 종합 점수 및 요약
- 어드레스·백스윙·임팩트·팔로우스루 단계별 점수와 코멘트
- 스윙 분석 포인트 및 추천 연습 방법
- 참고하면 좋을 선수 추천 + 해당 선수의 스윙을 바로 찾아볼 수 있는 YouTube 검색 링크
- 분석 결과는 자동으로 캘린더에 저장되어, 날짜별로 과거 분석 기록을 다시 확인 가능
- 이메일/비밀번호 기반 로그인으로 사용자별 분석 기록을 구분하여 관리

## 동작 방식

Claude API는 동영상을 직접 분석할 수 없으므로, 브라우저에서 `<video>` + `<canvas>`로
영상의 주요 구간(어드레스~팔로우스루)을 일정 간격의 정지 이미지(JPEG)로 추출한 뒤
Claude Vision에 전달하여 분석합니다 (`lib/extractFrames.ts`, `app/api/analyze-swing/route.ts`).

로그인한 사용자만 영상을 분석/저장할 수 있으며, 분석 기록은 사용자별로 분리되어
**Netlify Blobs**(Netlify 내장 키-값 저장소)에 저장됩니다 (`lib/auth.ts`, `lib/db.ts`,
`app/api/auth/*`, `app/api/history/route.ts`, `app/api/history/[id]/route.ts`).
Netlify에 배포하면 별도 설정 없이 자동으로 연결되므로 데이터베이스 생성이나 마이그레이션이
필요 없습니다. 서버에 저장되므로 어떤 브라우저/기기에서 로그인하더라도 같은 계정의
캘린더 기록을 확인할 수 있습니다.

## 로그인 / 회원가입

이메일과 비밀번호로 가입한 뒤 로그인하면 스윙 분석과 캘린더 기록을 사용할 수 있습니다.
계정마다 분석 기록이 분리되어 저장되므로, 다른 사람과 같은 사이트를 사용해도 자신의
기록만 확인할 수 있습니다.

- 비밀번호는 Node.js의 `scrypt`로 솔트와 함께 해시되어 저장되며 평문으로 저장되지 않습니다
  (`lib/auth.ts`).
- 로그인 세션은 서명된(signed) 쿠키로 관리되며, 서명에 사용하는 비밀 값은
  `SESSION_SECRET` 환경 변수로 설정합니다. **운영 환경에서는 반드시 충분히 길고
  무작위한 값으로 설정해야 합니다.** 예: `openssl rand -base64 48`

## 데이터 저장소 (Netlify Blobs)

Netlify Blobs는 Netlify에 배포된 사이트에서 환경 변수 설정 없이 자동으로 동작합니다.
별도 가입이나 연결 문자열 발급이 필요 없습니다. (사용자 계정 정보와 분석 기록 모두
Netlify Blobs에 저장됩니다.)

- **Netlify에 배포한 경우**: 추가 설정 없이 바로 동작합니다.
- **로컬에서 개발하는 경우**: `npm run dev` 대신 [Netlify CLI](https://docs.netlify.com/cli/get-started/)의
  `netlify dev`로 실행하면 로컬에서도 Blobs가 에뮬레이션되어 정상 동작합니다.
  (`netlify link`로 사이트를 먼저 연결해야 합니다.)

## 시작하기

```bash
npm install
cp .env.local.example .env.local   # ANTHROPIC_API_KEY, SESSION_SECRET 입력
npm run dev
```

기본 포트는 3001입니다 (`http://localhost:3001`).
로그인/캘린더/기록 저장 기능까지 로컬에서 테스트하려면 위 안내대로 `netlify dev`를 사용하세요.

## Vercel 배포

이 디렉터리는 모노레포 내 독립 Next.js 앱이므로, Vercel에서 **Root Directory를
`golf-swing-app`으로 지정**해야 합니다.

> ⚠️ **참고**: 로그인 및 캘린더 기록 저장 기능은 **Netlify Blobs**를 사용하므로 Netlify에
> 배포했을 때만 정상 동작합니다. Vercel에 배포하면 스윙 분석 자체는 동작하지만 로그인/
> 회원가입/기록 저장/캘린더 기능은 사용할 수 없습니다. 모든 기능을 사용하려면 아래
> "Netlify 배포"를 따르세요.

### 대시보드로 배포
1. https://vercel.com/new 에서 이 GitHub 저장소(`bjsearch/bjrepo`)를 Import
2. "Root Directory"를 `golf-swing-app`으로 설정 (Framework는 Next.js로 자동 인식)
3. Environment Variables에 `ANTHROPIC_API_KEY`, `SESSION_SECRET` 추가
4. Deploy

### CLI로 배포
```bash
cd golf-swing-app
npx vercel link        # 프로젝트 연결 (최초 1회, 로그인 필요)
npx vercel env add ANTHROPIC_API_KEY production
npx vercel env add SESSION_SECRET production
npx vercel --prod      # 프로덕션 배포
```

## Netlify 배포

`netlify.toml`과 `@netlify/plugin-nextjs`가 이미 설정되어 있습니다.
이 디렉터리도 모노레포 안에 있으므로 **Base directory를 `golf-swing-app`으로 지정**해야 합니다.

### 대시보드로 배포
1. https://app.netlify.com/start 에서 GitHub 저장소(`bjsearch/bjrepo`)와
   브랜치(`claude/inspiring-wozniak-ArLgz`)를 선택해 Import
2. **Base directory**: `golf-swing-app`
3. **Build command**: `npm run build` (자동 인식됨, `netlify.toml`에 명시되어 있음)
4. **Publish directory**: `golf-swing-app/.next` (Base directory를 지정하면 자동으로 `.next`가 됨)
5. Site settings → Environment variables에 `ANTHROPIC_API_KEY`와 `SESSION_SECRET` 추가
   (`SESSION_SECRET`은 로그인 세션 서명용 비밀 키이므로 충분히 길고 무작위한 값으로
   설정하세요. 예: `openssl rand -base64 48`. Netlify Blobs 자체는 별도 환경 변수 없이
   자동으로 연결됩니다)
6. Deploy site

### CLI로 배포
```bash
npm install -g netlify-cli
cd golf-swing-app
netlify init           # 또는 netlify link로 기존 사이트 연결
netlify env:set ANTHROPIC_API_KEY <your_key>
netlify env:set SESSION_SECRET <a_long_random_string>
netlify deploy --prod
```
