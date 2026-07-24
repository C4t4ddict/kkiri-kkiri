# 지난 활동과 미니포트폴리오

기존 `user_activity_participations`, `miniportfolios` 테이블을 재사용해 활동 종료 시점의 역할, 기간, 완료 작업을 사용자별 스냅샷으로 저장합니다.

## 자동 아카이브

- `teams.due_date`가 지난 팀
- `team_recruitments.activity_period`가 `4주`, `8주`처럼 저장된 경우 팀 생성일 기준 기간이 지난 팀
- `teams.activity_status`가 `COMPLETED`인 팀
- 팀장이 `POST /teams/:teamId/complete`를 호출한 팀

아카이브는 서버 시작 시, 한 시간마다, 진행 활동 또는 지난 활동 조회 전에 실행됩니다. `(user_id, team_id)` 고유 인덱스로 중복 생성을 막습니다.

## API

- `GET /users/:userId/past-activities`: 지난 활동 목록
- `GET /users/:userId/past-activities/:portfolioId`: 미니포트폴리오 상세
- `PUT /users/:userId/past-activities/:portfolioId`: 제목, 역할, 요약, 성과, 회고, 이미지, 링크 편집
- `POST /users/:userId/past-activities/:portfolioId/images`: 활동 사진 업로드(JPG, PNG, WEBP 단일 확장자, 최대 5MB)
- `GET /users/:userId/past-activities/:portfolioId/pdf`: 한글 PDF 다운로드
- `POST /teams/:teamId/complete`: 팀장 수동 활동 마무리

사용자 편집값은 자동 생성 스냅샷과 분리된 `portfolio_edits` 테이블에 저장하므로 팀 활동 원본 기록은 유지됩니다. PDF는 Noto Sans KR과 PDFKit을 사용하며 활동 사진, 활동 요약, 핵심 성과, 회고, 관련 링크와 월간·주간·일일 완료 작업 페이지로 구성됩니다. 업로드 파일은 확장자·MIME·실제 파일 시그니처를 모두 확인하고 무작위 파일명으로 저장합니다.
