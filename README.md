# 끼리끼리 (`kkiri_kkiri`)

끼리끼리는 React Native 기반의 팀 활동 관리 앱입니다. 활동 조회, 팀 찾기, 팀 만들기, 할 일 관리, 마이페이지 기능을 모바일 앱과 Node.js 서버로 함께 제공합니다.

## 프로젝트 구조

- `src/screens/`: 로그인, 홈, 정보, 활동, 매칭, 마이페이지, 투두 관련 화면
- `src/navigation/`: 탭/스택 네비게이션
- `src/context/`: 로그인 사용자 상태 관리
- `src/components/`: 재사용 입력 컴포넌트
- `src/constants/`, `src/utils/`, `src/widgets/`: 활동 위젯 설정과 공용 로직
- `android/`, `ios/`: Android/iOS 네이티브 설정
- `server/`: Express 서버, MySQL 연동, 업로드 파일 저장

## 실행 방법

### 1) 의존성 설치

```sh
npm install
cd server && npm install
```

### 2) 앱 실행

```sh
npm start
```

새 터미널에서 플랫폼별로 실행합니다.

```sh
npm run android
npm run ios
```

### 3) 서버 실행

```sh
cd server
npm start
```

## 환경 변수

서버 실행에는 루트 `.env` 파일이 필요합니다.

- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_PORT` 사용 가능

## 보안 안내

- 저장소에 포함되었던 프로필 이미지는 제거했습니다.
- 민감한 값은 `.env`로만 관리해야 합니다.
- 현재 코드에는 하드코딩된 API 키는 확인되지 않았습니다.

## 참고

- 앱 이름은 `kkiri_kkiri`로 맞췄고, 화면에 보이는 서비스명은 `끼리끼리`입니다.
- React Native 기본 구조를 유지하되, 활동 위젯과 투두 화면은 별도 모듈로 분리되어 있습니다.
