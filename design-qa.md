# 디자인 QA

- 기준 이미지: `/var/folders/hb/lmqmwjpx2w1cbvqy8xxm3jzm0000gn/T/TemporaryItems/NSIRD_screencaptureui_A3EFfz/스크린샷 2026-07-16 오후 2.17.22.png`
- 구현 캡처: `/tmp/kkiri-activity-tabs2.png`
- 검증 환경: Android Emulator, 1080 × 2400
- 비교 범위: 활동 링그래프, 진행률 레이블, 목표 목록과 선택 상태

## 비교 결과

- 네 개의 동심원 링, 둥근 양 끝, 진한 색에서 연한 색으로 이어지는 계층을 기준 이미지와 동일하게 유지했다.
- 기준 이미지의 가로형 구성을 모바일 카드 폭에 맞게 반응형으로 재배치하되 링과 네 개의 수치 레이블 관계는 유지했다.
- 진행률 차이가 링 길이로 명확히 구분되며 앱 기본색 `#7A5AF8`과 보조 보라색 계열을 사용했다.
- 일일·주간·월간 목표는 한 번에 하나만 표시되고 선택 탭, 진행률, 진행 중 항목이 명확히 강조된다.
- 실제 에뮬레이터에서 탭 전환, 히트맵 월 이동, 정보 상세 포스터 비율과 본문 스크롤을 확인했다.

## 이슈 등급

- P0: 없음
- P1: 없음
- P2: 없음
- P3: 기준 이미지는 가로형 독립 시안이고 구현은 모바일 카드이므로 텍스트 위치가 반응형으로 조정됨

## 이슈 #14 검증

- 홈 기준 캡처: `/tmp/issue14-home.png`
- 비교 캡처: `/tmp/issue14-info.png`, `/tmp/issue14-matching.png`
- 헤더 로고 영역: 홈·정보·활동·매칭 모두 `[53,60][317,160]`으로 일치
- 로고 동작: 활동 탭에서 로고를 눌러 홈 탭과 홈 콘텐츠로 이동하는 것을 확인
- 링 애니메이션: `/tmp/issue14-ring-early.png`, `/tmp/issue14-ring-middle.png`, `/tmp/issue14-ring-finished.png` 순서로 목표 진행률까지 부드럽게 채워지는 것을 확인
- 링 디자인: 기존 동심원 구조, 색상, 레이블 배치를 변경하지 않음

## 이슈 #14 등급

- P0: 없음
- P1: 없음
- P2: 없음

## 이슈 #15 검증

- 활동 헤더 캡처: `/tmp/issue15-current.png`
- 활동 편집 캡처: `/tmp/issue15-settings.png`, `/tmp/issue15-dragged.png`, `/tmp/issue15-reopened.png`
- 활동 편집·알림 버튼의 터치 영역을 각각 44dp 정사각형으로 통일하고 아이콘을 중앙 정렬함
- 링그래프를 첫 번째에서 세 번째로 드래그한 뒤 다른 위젯이 부드럽게 재배치되는 것을 확인함
- 저장 후 활동 편집 화면에 재진입해 변경된 순서가 유지되는 것을 확인함
- `folder.png`는 존재하지만 `MyActivityScreen.tsx`가 비어 있고 앱 라우트가 없어 지난 활동 아이콘은 연결하지 않음

## 이슈 #15 등급

- P0: 없음
- P1: 없음
- P2: 없음

## 이슈 #16 검증

- 지난 활동 목록 캡처: `/tmp/issue16-list.png`
- 미니포트폴리오 캡처: `/tmp/issue16-detail.png`
- 활동 마무리 UI 캡처: `/tmp/issue16-settings-leader.xml`
- 실제 데이터 PDF 렌더링: `/tmp/pdfs/issue16-actual/portfolio-1.png`, `/tmp/pdfs/issue16-actual/portfolio-2.png`
- 기존 `user_activity_participations`, `miniportfolios` 테이블을 확장하고 만료·완료된 11개 팀을 중복 없이 아카이브함
- 지난 활동 목록, 미니포트폴리오 상세, 월간·주간·일일 완료 작업이 실제 DB 데이터로 표시됨
- Android 다운로드 관리자가 PDF를 성공 처리하고 완료 알림을 표시하는 것을 확인함
- 팀장이 아닌 사용자의 마무리 요청은 403으로 차단되고, 팀장 성공 경로는 트랜잭션 롤백 방식으로 검증함

## 이슈 #16 등급

- P0: 없음
- P1: 없음
- P2: 없음

## 이슈 #17 검증

- 진행 활동 빈 상태 캡처: `/tmp/issue17-activity-empty-3.png`
- 빈 드롭다운 캡처: `/tmp/issue17-activity-dropdown.png`
- 지난 활동 이동 캡처: `/tmp/issue17-past-from-empty-2.png`
- 선형대수학 실제 PDF: `/tmp/pdfs/issue17/linear-algebra.pdf`
- PDF 전체 렌더링: `/tmp/pdfs/issue17/page-1.png` ~ `/tmp/pdfs/issue17/page-6.png`
- 사용자 1의 진행 팀은 0건, 지난 활동은 11건이며 공모전 정보 70건과 참여 팀 데이터가 별도임을 API와 DB 연동 결과로 확인함
- 진행 활동이 없을 때 종료된 활동의 위치를 설명하고 `지난 활동 보기` 버튼으로 실제 목록 화면에 이동하는 것을 확인함
- 완료 작업 61건을 포함한 선형대수학 미니포트폴리오를 A4 6페이지로 생성하고 모든 카드와 작업 항목이 페이지 경계에서 잘리지 않음을 확인함

## 이슈 #17 등급

- P0: 없음
- P1: 없음
- P2: 없음

## 이슈 #18 검증

- 홈·정보·활동·매칭·마이페이지 새로고침 요청을 Android Emulator에서 실제 API 로그로 확인함
- 마이페이지 새로고침 애니메이션 캡처: `/tmp/kkiri-refresh.png`
- 접수 상태 캡처: `/tmp/kkiri-info.png` (`접수중 D-n`, `예정` 표시 확인)
- 활동 링 시작·완료 캡처: `/tmp/kkiri-activity-start.png`, `/tmp/kkiri-activity-end.png`
- 현재 접수 중인 89번 공모전 기반 예시 팀과 사용자 1·2·3의 역할·목표 데이터를 생성함
- 활동 선택, 팀원 목표 화면, 김유신 목표 조회, 본인 역할 수정 모달을 실제 화면과 API로 확인함
- 서버 시작 30초 뒤 자동 수집이 실행되어 씽굿 30건·위비티 50건, 총 80건을 오류 없이 저장함
- 마이페이지에서 상단 로고와 알림을 제거하고 프로필 본문과 하단 탭이 정상 표시되는 것을 확인함

## 이슈 #18 등급

- P0: 없음
- P1: 없음
- P2: 없음

final result: passed
