## 변경 내용

- 활동 목표를 상태/수정 시각이 아닌 등록 순서로 고정하고 진행 중 하이라이트, 완료 회색·취소선을 적용했습니다.
- 날짜 이전/다음/오늘/직접 선택과 일·주·월 목표 조회·저장을 연결했습니다. 정확한 기간 조회 옵션으로 옛 미지정 목표의 반복 노출을 방지합니다.
- 활동 중복 패널·큰 진행률 영역·과도한 아이콘을 줄이고 목표/히트맵 중심의 기본 그리드와 도구 바로가기를 제공합니다. 사용자 편집 배치는 유지합니다.
- 히트맵 이름·중앙 정렬, 날짜 중심의 다가오는 일정, 매칭 최대 폭/2열 카드/단순 필터를 적용했습니다.
- 직전 미커밋 홈 로고와 세로 띠 제거를 포함하고 홈 로고 전환 주기를 4초로 설정했습니다.
- 변경 전후/모바일 스크린샷과 검증 기록을 보존합니다.

## 수정 파일

- `web/src/pages/ActivityPage.tsx`, `features/activity/ActivityToolGrid.tsx`, `features/activity/goalPeriod.ts`: 활동 흐름·기간 조회·상태 표시·배치.
- `web/src/pages/MatchingPage.tsx`, `web/src/styles/workspace.css`, `web/src/main.tsx`: 매칭 및 활동 스타일.
- `server/server.js`: 목표 등록 순서와 정확한 기간 조회 옵션.
- `web/src/pages/HomePage.tsx`, `web/src/styles.css`: 홈 회전 로고, 세로 띠 제거, 모션 감소.
- `web/src/activity-documents.css`, `web/src/features/curricula/CurriculumCard.tsx`, `src/screens/{AdminScreen,CurriculumListScreen,DeveloperFeedbackScreen,mypage2,mypage4}.tsx`: 장식용 세로 띠 제거.
- `__tests__/goalPeriod.test.ts`, `docs/changes/workspace-readability-qa.md`, `screenshots/2026-09-07-workspace/`: 회귀 검사와 화면 증거.

## 검증

- [x] 웹 프로덕션 빌드 및 앱 TypeScript 검사 통과.
- [x] 목표 기간/순서 및 앱 진입 Jest 7개 통과.
- [x] 서버 테스트 85개 통과.
- [x] 실제 로컬 API/MySQL로 활동 선택, 날짜 이동/저장, 상태 전환/순서 유지 확인. 생성한 테스트 목표는 삭제.
- [x] 그리드 편집/보존, 매칭 검색/필터/초기화, 히트맵 중앙 정렬 확인.
- [x] 홈 전환 간격 약 4013ms 및 모션 감소 확인.
- [x] 390/820/1100/1440px에서 가로 넘침 없음. 스크린샷 보존.
- [ ] CodeRabbit 리뷰 확인.

상세: [검증 보고서](docs/changes/workspace-readability-qa.md).

## 연결 이슈

Closes #115

## 참고 사항

- 기준: 최신 `origin/develop` (99a7633). 운영 배포·DB 스키마 변경 없음.
- 기존 루트 체크아웃 변경과 사용자 업로드는 커밋에서 제외했습니다.
- 과거 열린 PR 7개는 임의로 병합/종료하지 않았습니다.
