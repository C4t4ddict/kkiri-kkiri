This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

## 운영 안정성 설정

서버는 MySQL 커넥션 풀, 활동 목록 단기 캐시, 서명된 로그인 토큰을 사용합니다. `server/.env.example`을 기준으로 환경변수를 준비하고, 운영 환경에서는 반드시 `NODE_ENV=production`, 충분히 긴 `AUTH_TOKEN_SECRET`, `ALLOW_LEGACY_USER_HEADER=false`, `OPS_API_TOKEN`을 설정합니다.

- `GET /api/health`: 공개 생존 상태와 DB 연결 상태 확인
- `GET /api/db-health`: 실제 DB 쿼리 상태 확인
- `GET /api/ops/status`: `x-ops-token` 헤더가 필요한 요청·메모리·캐시·최근 크롤링 상태 확인
- `DB_CONNECTION_LIMIT`: API 서버의 MySQL 동시 연결 상한
- `ACTIVITY_CACHE_TTL_MS`: 활동 목록 캐시 유지 시간
- `LOG_LEVEL`: 운영은 `info`, 상세 진단은 일시적으로 `debug` 권장
- `ADMIN_EMAILS`: 쉼표로 구분한 운영자 이메일. 서버 시작 시 해당 계정에 운영 권한을 부여

크롤러 운영 방법과 수집 이력 테이블은 `server/crawler/README.md`를 참고합니다.

## 앱 운영 관리

`ADMIN_EMAILS`에 등록된 계정은 마이페이지의 `운영 관리` 메뉴에서 활동 데이터 품질과 크롤러 상태를 관리할 수 있습니다.

- 전체·이미지 누락·중복 의심·숨김 활동 조회 및 검색
- 활동 제목, 카테고리, 포스터 URL 수정
- 품질이 낮은 활동 숨김 또는 다시 공개
- 최근 크롤링 실행·오류 확인 및 즉시 수집 실행

운영 API는 로그인 토큰과 DB의 `users.is_admin` 권한을 모두 확인합니다. 운영 환경에서는 `ADMIN_EMAILS`와 `AUTH_TOKEN_SECRET`을 비밀 환경변수로 관리합니다.

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
