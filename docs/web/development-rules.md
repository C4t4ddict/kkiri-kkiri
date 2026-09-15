# 웹 개발 규칙서

## 1. 기술 기준

- React 19, TypeScript, Vite
- React Router
- 기존 Express API와 MySQL DB
- 아이콘은 `lucide-react`
- 서버 상태 관리 도입 시 TanStack Query를 표준으로 사용
- 폼 복잡도가 커질 때 React Hook Form + schema validator 도입을 별도 결정

브라우저에서 MySQL에 직접 접속하거나 앱 전용 localhost 주소를 컴포넌트에 하드코딩하지 않는다.

## 2. 디렉터리와 의존 방향

```text
web/src/
├── app/                 # Router, Provider, Shell, 권한 가드
├── pages/               # URL 단위 화면 조립
├── widgets/             # 페이지의 독립적인 복합 블록
├── features/            # 저장·지원·상태변경 등 사용자 행동
├── entities/            # activity, recruitment, todo, user 모델·UI
├── shared/
│   ├── api/             # fetch client, DTO, adapter
│   ├── auth/            # session과 권한
│   ├── config/          # 환경 설정
│   ├── hooks/           # 범용 hook
│   ├── lib/             # 순수 함수
│   ├── styles/          # token과 global style
│   └── ui/              # 도메인 비의존 UI
└── assets/
```

의존 방향은 `app → pages → widgets → features → entities → shared`다. 아래 계층이 위 계층을 import하지 않는다.

## 3. 코드 규칙

### TypeScript

- `any`를 추가하지 않는다. 외부 응답은 `unknown`에서 검증하거나 DTO 타입을 정의한다.
- API DTO와 UI domain model을 분리하고 adapter에서 필드명·boolean·날짜를 정규화한다.
- identifier는 DB 필드와 무관한 UI 내부에서는 camelCase를 사용한다.
- 상태값은 문자열을 흩뿌리지 않고 union 또는 상수 map으로 관리한다.
- 한 함수는 한 수준의 추상화를 유지하며 화면 컴포넌트에서 SQL 개념을 다루지 않는다.

### React

- 페이지는 데이터 조회와 widget 조합을 담당하고 세부 도메인 동작은 feature로 분리한다.
- 파생 상태를 별도 state로 중복 저장하지 않는다.
- effect에서 데이터 fetch를 직접 반복하지 않고 공통 query hook을 사용한다.
- list key에 배열 index를 사용하지 않는다.
- 모달·Drawer는 route로 열어야 할지 먼저 판단한다. 공유 가능한 상세 화면은 route를 우선한다.
- 오류 경계와 페이지 상태 컴포넌트를 사용해 빈 화면을 만들지 않는다.

### CSS

- [디자인 컨벤션](./design-conventions.md)의 token만 사용한다.
- 반응형은 콘텐츠 기준 breakpoint를 사용하고 기기명을 조건으로 삼지 않는다.
- 모바일 우선 또는 데스크톱 우선 중 한 파일 안에서는 한 방향을 유지한다.
- 고정 높이는 navigation, button, icon처럼 크기가 보장된 요소에만 사용한다.
- `100vh`가 모바일 브라우저 UI와 충돌할 때 `dvh` fallback을 적용한다.

## 4. API와 상태 관리

- 모든 요청은 `shared/api/client`를 통한다.
- query key는 `['activities', filters]`처럼 도메인과 조건을 모두 포함한다.
- mutation 성공 후 관련 query를 정확히 invalidate하거나 optimistic update한다.
- 401은 세션 정리 후 로그인으로 이동한다.
- 403은 로그인 이동이 아니라 권한 설명 화면을 표시한다.
- 서버의 한글 오류 메시지는 사용자 표시용이며 분기에는 향후 표준 오류 code를 사용한다.
- 이미지 URL은 API base와 안전하게 결합하고 외부 URL protocol을 검증한다.

## 5. 권한 규칙

- 권한 판정의 최종 책임은 서버에 있다.
- 프론트 route guard는 UX 최적화이며 보안 경계가 아니다.
- 사용자 ID를 request body에서 받아도 Bearer token의 사용자와 일치하는지 서버가 확인해야 한다.
- 관리자 메뉴와 route는 `is_admin`일 때만 보이고 API도 `requireAdmin`을 통과해야 한다.
- 학교 모집은 인증된 학생과 같은 `school_domain`만 접근한다.
- 팀 정보·할 일·공지사항은 팀원 여부를 서버에서 확인한다.
- 수정·삭제는 소유자 또는 명시된 역할만 가능하다.

## 6. 보안 규칙

- `.env`, token, 비밀번호, 인증코드, 운영 계정, DB dump를 commit하지 않는다.
- 보안 관련 실제 값은 Issue·PR·로그·문서에도 붙이지 않는다.
- 비밀번호와 인증 secret은 원문 저장·응답·로그 출력을 금지한다.
- HTML 문자열을 직접 주입하지 않는다. 불가피한 경우 sanitizer와 allowlist를 적용한다.
- 업로드는 크기, 개수, 확장자, MIME, magic bytes를 모두 검증한다.
- 외부 링크는 허용 protocol을 확인하고 새 탭은 `rel="noopener noreferrer"`를 사용한다.
- localStorage token은 임시 구현으로 취급하고 운영 전 cookie 전환을 검토한다.
- 사용자 입력과 서버 오류 객체를 통째로 로그에 남기지 않는다.
- destructive endpoint에는 본인·소유권 검사와 감사 가능한 로그를 둔다.

## 7. 테스트 규칙

### 최소 검증

```bash
npm --prefix web run lint
npm --prefix web run build
npm test -- --runInBand --watchman=false
node --test server/lib/test/*.tests.js
```

### 테스트 층

| 층          | 대상                       | 기준                              |
| ----------- | -------------------------- | --------------------------------- |
| Unit        | 날짜, 상태, 권한, adapter  | 경계값과 오류값 포함              |
| Component   | 필터, 카드, 폼, 모달       | 접근성 role과 사용자 동작 중심    |
| Integration | query + 화면 + mock API    | loading/empty/error/success 모두  |
| E2E         | 가입·로그인·정보·매칭·활동 | 일반/학생/관리자 권한별 핵심 흐름 |

버그 수정은 가능하면 실패하는 재현 테스트를 먼저 추가한다. 시간과 네트워크에 의존하는 테스트는 clock과 API를 고정한다.

## 8. Git과 작업 흐름

1. 작업 전에 GitHub Issue를 생성한다.
2. 최신 `develop`에서 `codex/issue-{번호}-{설명}` 브랜치를 만든다.
3. 하나의 커밋은 리뷰 가능한 작은 기능 단위를 유지한다.
4. 커밋과 PR 제목은 `type(scope): 한글 작업 요약` 형식을 사용한다.
5. 원격 브랜치에 push하고 Draft PR을 만든다.
6. PR 본문에 `변경 내용`, `수정 파일`, `검증`, `연결 이슈`를 작성한다.
7. CodeRabbit과 CI 결과를 확인하고 검토 전 merge하지 않는다.

권장 scope: `web`, `auth`, `home`, `info`, `activity`, `matching`, `mypage`, `notification`, `admin`, `server`, `database`.

## 9. Commit 단위 예시

```text
docs(web): 화면 정의서와 디자인 규칙 추가
docs(database): 웹 연동 핵심 ERD 작성
docs(server): 웹 API 명세와 권한 규칙 정리
```

기능 구현 시 token, 공통 UI, API adapter, 페이지를 한 대형 커밋에 넣지 않고 검증 가능한 순서로 나눈다.

## 10. PR 리뷰 체크리스트

- 요구사항과 Issue 범위만 변경했는가
- 앱·웹 간 상태명과 카테고리가 일치하는가
- 일반·학생·관리자 권한을 각각 확인했는가
- loading·empty·error·403 상태가 있는가
- 모바일·태블릿·데스크톱에서 overflow가 없는가
- 키보드와 screen reader 이름이 제공되는가
- 새로운 secret·개인정보·민감 로그가 없는가
- API·DB 계약 변경 시 문서가 갱신됐는가
- 관련 테스트와 build가 통과했는가
- 수정 파일이 PR 본문에 모두 적혔는가

## 11. Definition of Done

- 기능 요구사항과 화면 정의서가 일치한다.
- 서버 권한 검사가 구현되고 프론트 guard가 보완한다.
- 모든 공통 상태가 디자인대로 표시된다.
- TypeScript, lint, unit/integration test, production build가 통과한다.
- 필요한 문서와 API·ERD가 함께 갱신된다.
- 보안 점검과 CodeRabbit review thread를 확인한다.
- Draft PR 상태에서 사용자 검토를 기다리며 임의로 merge하지 않는다.
