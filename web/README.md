# 끼리끼리 React 웹

React Native 앱과 같은 Express API 및 MySQL 데이터베이스를 사용하는 웹 클라이언트입니다.

## 디렉터리 구조

```text
src/
├── app/                 # 앱 조립, 인증 Context, 라우팅, 전역 레이아웃
├── pages/               # URL 단위 화면
├── features/            # 활동·지원 등 도메인별 재사용 기능
├── shared/
│   ├── api/             # HTTP 클라이언트
│   ├── auth/            # 브라우저 세션 저장소
│   ├── hooks/           # 범용 React 훅
│   ├── types/           # API 도메인 타입
│   └── ui/              # 도메인에 의존하지 않는 공통 UI
├── styles.css           # 디자인 토큰과 반응형 스타일
└── main.tsx             # 브라우저 진입점
```

## 의존 방향

`app → pages → features → shared` 순서로만 의존합니다. `shared`는 특정 페이지를 import하지 않고, `features`는 `pages`를 import하지 않습니다.

- URL에서 직접 열리는 화면: `pages/`
- 여러 화면에서 재사용되는 업무 기능: `features/{domain}/`
- API·타입·범용 UI: `shared/`
- 라우트·Provider·레이아웃 변경: `app/`

## 반응형 기준

- 1000px 초과: 고정 사이드바와 3열 콘텐츠
- 721px~1000px: 축소 사이드바와 2열 콘텐츠
- 720px 이하: 상단 로고와 하단 내비게이션, 1열 콘텐츠

동일한 React 컴포넌트를 유지하고 CSS 미디어쿼리로 배치만 변경합니다. 모바일과 데스크톱의 업무 흐름이 달라질 때만 별도 컴포넌트로 분리합니다.

## 실행

```sh
npm install
npm run dev
```

운영 빌드는 `npm run build`로 검증합니다. API 주소는 기본적으로 `http://localhost:3000`이며 배포 시 `VITE_API_BASE_URL`로 변경합니다.
