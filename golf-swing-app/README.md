# 골프 스윙 분석기 (Golf Swing Analyzer)

스윙 영상을 업로드하고 사용한 클럽(드라이버 / 아이언 번호 / 웻지 각도)을 선택하면,
AI가 영상에서 추출한 프레임을 분석하여 다음을 제공합니다.

- 스윙 종합 점수 및 요약
- 단계별 스윙 분석
- 추천 연습 방법
- 참고하면 좋을 선수 추천

## 동작 방식

Claude API는 동영상을 직접 분석할 수 없으므로, 브라우저에서 `<video>` + `<canvas>`로
영상의 주요 구간(어드레스~팔로우스루)을 일정 간격의 정지 이미지(JPEG)로 추출한 뒤
Claude Vision에 전달하여 분석합니다 (`lib/extractFrames.ts`, `app/api/analyze-swing/route.ts`).

## 시작하기

```bash
npm install
cp .env.local.example .env.local   # ANTHROPIC_API_KEY 입력
npm run dev
```

기본 포트는 3001입니다 (`http://localhost:3001`).

## Vercel 배포

이 디렉터리는 모노레포 내 독립 Next.js 앱이므로, Vercel에서 **Root Directory를
`golf-swing-app`으로 지정**해야 합니다.

### 대시보드로 배포
1. https://vercel.com/new 에서 이 GitHub 저장소(`bjsearch/bjrepo`)를 Import
2. "Root Directory"를 `golf-swing-app`으로 설정 (Framework는 Next.js로 자동 인식)
3. Environment Variables에 `ANTHROPIC_API_KEY` 추가
4. Deploy

### CLI로 배포
```bash
cd golf-swing-app
npx vercel link        # 프로젝트 연결 (최초 1회, 로그인 필요)
npx vercel env add ANTHROPIC_API_KEY production
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
5. Site settings → Environment variables에 `ANTHROPIC_API_KEY` 추가
6. Deploy site

### CLI로 배포
```bash
npm install -g netlify-cli
cd golf-swing-app
netlify init           # 또는 netlify link로 기존 사이트 연결
netlify env:set ANTHROPIC_API_KEY <your_key>
netlify deploy --prod
```
