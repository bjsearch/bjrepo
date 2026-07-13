# Glasses Caddie — Meta 스마트 안경 × 골프 워치 컴패니언 앱

스마트 골프 워치와 연동해 라운드 중 핀까지 거리, 추천 클럽, 스코어를 Meta 스마트 안경의
HUD(Head-Up Display) 형태로 보여주는 컴패니언 웹 앱입니다.

## 이 앱이 할 수 있는 것 / 할 수 없는 것 (중요)

이 앱은 실제 하드웨어 제약을 감안해 아래처럼 정직하게 범위를 나눴습니다.

- **Meta 스마트 안경**: Meta는 서드파티 개발자가 안경에 직접 앱을 설치할 수 있는 공개 SDK를
  제공하지 않습니다(2026년 현재, Meta AI 앱 / Meta View 앱을 통한 제한적 연동과 일부
  Wearables Device Access Toolkit 파트너 프로그램만 존재). 그래서 `app/page.tsx`의 **HUD
  탭**은 안경 디스플레이에 실제로 표시될 화면을 폰/웹 화면에서 미리보는
  **시뮬레이션**입니다. Meta의 디바이스 액세스 툴킷 사용 권한이 있는 환경이라면, 여기서
  계산한 동일한 데이터(거리·클럽 추천)를 그 SDK로 그대로 전달해 안경에 캐스팅하도록
  연동할 수 있습니다.
- **스마트 골프 워치**: Garmin, Coros, Shot Scope 등 골프 워치 제조사들은 홀 번호·핀까지
  거리 같은 골프 전용 데이터를 공개 BLE 프로토콜로 제공하지 않고, 각자의 폐쇄형 앱/API로만
  제공합니다. 따라서 이 앱의 **실제 Bluetooth 연결(Web Bluetooth API)**은 대부분의 스포츠
  워치가 표준으로 브로드캐스트하는 **심박수(Heart Rate)·배터리(Battery Level) GATT
  서비스**만 실시간으로 받아옵니다.
  - 홀·핀 거리 데이터는 **데모 모드**(가상 라운드 시뮬레이션)로 미리보거나, **라운드 탭에서
    직접 입력**(워치 화면에 표시된 거리를 손으로 입력)해서 사용합니다.
  - 특정 워치 제조사의 SDK/파트너십이 있다면 `lib/bluetoothWatch.ts`에 해당 프로토콜 연동을
    추가해 실제 거리 데이터를 자동으로 받아오도록 확장할 수 있습니다.

## 주요 기능

- **워치 연결** (`연결` 탭): Web Bluetooth로 실제 기기 페어링, 또는 데모 모드로 가상 라운드
  데이터 스트리밍
- **글래스 HUD 미리보기** (`HUD` 탭): 핀까지 거리(전/중/후), 추천 클럽, 직전 샷 거리를 안경
  디스플레이 스타일(작고 어둡고 고대비)로 표시
- **라운드 스코어** (`라운드` 탭): 홀 이동, 파/타수/퍼트 기록, 스코어카드 합계, 핀 거리 수동
  입력
- **클럽 추천** (`lib/clubRecommend.ts`): 사용자가 설정한 클럽별 평균 비거리를 기준으로 남은
  거리에 맞는 클럽 자동 추천
- **음성 명령** (`음성` 탭): 브라우저 Web Speech API로 "핀까지 거리 알려줘", "클럽
  추천해줘", "다음 홀"과 같은 한국어 음성 명령 인식 + 음성 응답(TTS). Meta 안경의 "Hey
  Meta" 음성 비서 흐름을 웹에서 근사적으로 재현한 것입니다.
- **설정** (`설정` 탭): 클럽별 평균 거리 프로필 편집 (로컬 저장)

모든 데이터(클럽 프로필, 라운드 스코어)는 브라우저 `localStorage`에 저장되는 로컬 전용
데이터이며, 별도 로그인이나 서버 저장소가 없습니다.

## 시작하기

```bash
npm install
npm run dev
```

기본 포트는 3002입니다 (`http://localhost:3002`).

Web Bluetooth 실제 기기 연결과 Web Speech 음성 인식을 테스트하려면 **HTTPS 환경 + Android
Chrome** 등 지원 브라우저에서 열어야 합니다(로컬 `http://localhost`는 예외적으로 허용됨).

## Vercel 배포

이 디렉터리는 모노레포 내 독립 Next.js 앱이므로, Vercel에서 **Root Directory를
`meta-glasses-golf-app`으로 지정**해야 합니다.

1. https://vercel.com/new 에서 이 GitHub 저장소(`bjsearch/bjrepo`)를 Import
2. "Root Directory"를 `meta-glasses-golf-app`으로 설정 (Framework는 Next.js로 자동 인식)
3. Deploy

## 디렉터리 구조

```
meta-glasses-golf-app/
├── app/
│   ├── layout.tsx        # 루트 레이아웃
│   ├── page.tsx          # 탭 기반 메인 화면
│   └── globals.css
├── components/
│   ├── WatchConnect.tsx  # BLE 페어링 / 데모 모드 UI
│   ├── GlassesHUD.tsx    # 안경 디스플레이 시뮬레이션
│   ├── RoundPanel.tsx    # 홀 이동, 스코어, 거리 수동 입력
│   ├── ClubProfile.tsx   # 클럽별 평균 거리 설정
│   └── VoiceBar.tsx      # 음성 명령 인식 + TTS 응답
└── lib/
    ├── bluetoothWatch.ts # Web Bluetooth 연결 + 데모 시뮬레이터
    ├── clubRecommend.ts  # 거리 기반 클럽 추천 로직
    ├── storage.ts        # localStorage 영속화
    ├── types.ts
    ├── webBluetooth.d.ts # Web Bluetooth 앰비언트 타입
    └── webSpeech.d.ts    # Web Speech API 앰비언트 타입
```
