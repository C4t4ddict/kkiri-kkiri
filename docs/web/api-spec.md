# API 명세서

## 1. 공통 계약

### Base URL

- 로컬: `http://localhost:3000`
- 웹 배포: `VITE_API_BASE_URL` 환경변수 사용
- 운영 URL은 저장소와 문서에 하드코딩하지 않는다.

### 인증

현재 로그인 성공 시 HMAC 서명 Bearer token을 반환한다.

```http
Authorization: Bearer <token>
```

- 기본 만료: 7일
- 운영 환경은 `AUTH_TOKEN_SECRET` 필수
- `x-user-id`, body/query `user_id` 호환 인증은 비운영 환경에서만 허용 가능
- 웹의 현재 `localStorage` 저장은 XSS 노출 위험이 있으므로 운영 웹에서는 HttpOnly·Secure·SameSite cookie 전환을 별도 설계한다.

### 형식

- Request/Response: `application/json; charset=utf-8`
- 날짜: `YYYY-MM-DD`
- 날짜시간: ISO 8601로 직렬화하는 것을 목표로 하되 현재 MySQL DATETIME 응답은 서버별 형식을 점검한다.
- 금액: 원 단위 정수
- boolean: API 응답은 `true/false`로 정규화하는 것을 목표로 한다.

### 공통 오류

```json
{ "message": "사용자가 이해할 수 있는 오류 설명" }
```

| HTTP | 의미                                 |
| ---- | ------------------------------------ |
| 400  | 형식·필수값·상태 전이 오류           |
| 401  | 인증 없음·만료                       |
| 403  | 본인·팀원·학교·관리자 권한 없음      |
| 404  | 리소스 없음                          |
| 409  | 중복·동시성·기간 목표 최대 개수 충돌 |
| 429  | 이메일 인증 요청 제한                |
| 500  | 처리 실패                            |
| 503  | DB 등 의존 서비스 사용 불가          |

## 2. 주요 DTO

### User

```json
{
  "id": 1,
  "user_id": 1,
  "email": "user@example.com",
  "name": "사용자",
  "department": "학과",
  "student_number": "학번",
  "birth": "2000-01-01",
  "profile_picture": "/uploads/profile.jpg",
  "is_admin": false,
  "email_verified": true,
  "account_type": "GENERAL",
  "school_domain": null,
  "school_name": null
}
```

### ActivitySummary

```json
{
  "activity_id": 1,
  "title": "활동명",
  "category": "공모전",
  "topic_category": "IT/기술",
  "organizer": "주최기관",
  "main_image_url": "https://...",
  "application_period_start": "2026-08-01",
  "application_period_end": "2026-08-31",
  "prize_details": "총상금 1,000만원",
  "open_recruitment_count": 2
}
```

### Todo

```json
{
  "todo_id": 1,
  "team_id": 3,
  "assigned_user_id": 1,
  "title": "기획안 작성",
  "status": "진행중",
  "scope_type": "일일",
  "scope_start_date": "2026-08-12",
  "scope_end_date": "2026-08-12",
  "range_group_id": null,
  "range_color": null,
  "completed_at": null
}
```

## 3. 인증 API

| Method | Path                               | 인증 | 설명                          |
| ------ | ---------------------------------- | ---- | ----------------------------- |
| POST   | `/auth/email-verification/request` | 없음 | 가입 이메일 인증코드 요청     |
| POST   | `/auth/email-verification/verify`  | 없음 | 6자리 코드 확인               |
| POST   | `/api/register`                    | 없음 | 인증 완료 이메일로 회원가입   |
| POST   | `/api/login`                       | 없음 | 로그인 및 token 발급          |
| POST   | `/auth/password-reset/request`     | 없음 | 재설정 코드 요청              |
| POST   | `/auth/password-reset/verify`      | 없음 | 코드 확인 및 reset token 발급 |
| POST   | `/auth/password-reset/confirm`     | 없음 | 비밀번호 변경                 |

### 로그인

```http
POST /api/login
Content-Type: application/json

{ "email": "user@example.com", "password": "********" }
```

```json
{
  "success": true,
  "message": "로그인 성공",
  "user": { "id": 1, "email": "user@example.com", "name": "사용자" },
  "token": "<redacted>"
}
```

### 이메일 인증 제한

- 코드 유효시간 10분
- 요청 간격 60초
- 최대 확인 실패 5회
- 가입 인증 완료 후 가입 가능 시간 30분
- 비밀번호 reset token 유효시간 10분

## 4. 활동 정보·관심 활동

| Method | Path                                   | 인증 | 설명                        |
| ------ | -------------------------------------- | ---- | --------------------------- |
| GET    | `/api/activities`                      | 선택 | 활동 목록·검색·페이지네이션 |
| GET    | `/api/activities/open`                 | 선택 | 접수 중 활동 목록           |
| GET    | `/api/activities/:id`                  | 선택 | 활동 상세                   |
| GET    | `/api/activities/:id/recruitments`     | 선택 | 접근 가능한 관련 모집글     |
| GET    | `/api/favorite-activities`             | 필요 | 관심 활동 목록              |
| GET    | `/api/favorite-activities/ids`         | 필요 | 관심 활동 ID 목록           |
| POST   | `/api/favorite-activities/:activityId` | 필요 | 관심 활동 저장              |
| DELETE | `/api/favorite-activities/:activityId` | 필요 | 관심 활동 해제              |

활동 목록 query는 서버 구현을 기준으로 `page`, `limit`, 검색·카테고리·기간 조건을 사용한다. 프론트는 query key에 모든 필터를 포함하고 응답이 배열인지 `{items, pagination}`인지 호출 API별 adapter에서 정규화해야 한다.

## 5. 팀 모집·지원

| Method | Path                                                                       | 인증      | 권한·설명                                |
| ------ | -------------------------------------------------------------------------- | --------- | ---------------------------------------- |
| GET    | `/api/team-recruitments`                                                   | 선택      | 전국 + 인증 사용자의 동일 학교 모집 조회 |
| POST   | `/api/team-recruitments`                                                   | 필요      | 모집 작성, 학교 범위는 학교 인증 필요    |
| GET    | `/api/team-recruitments/:id`                                               | 선택      | 작성자 또는 접근 가능한 사용자 조회      |
| PUT    | `/api/team-recruitments/:id`                                               | 필요      | 작성자 수정                              |
| DELETE | `/api/team-recruitments/:id`                                               | 필요      | 작성자 soft delete                       |
| GET    | `/api/my-recruitments`                                                     | 필요      | 내가 작성한 모집글                       |
| GET    | `/api/team-recruitments/:id/applications`                                  | 작성자    | 지원자 목록                              |
| POST   | `/api/applications`                                                        | 필요      | 모집글 지원                              |
| GET    | `/api/my-applications`                                                     | 필요      | 나의 지원 목록                           |
| GET    | `/api/my-applications/:applicationId`                                      | 본인      | 지원 상세·타임라인                       |
| PUT    | `/api/applications/:id/cancel`                                             | 본인      | 지원 취소                                |
| PUT    | `/api/applications/:id/status`                                             | 모집자    | 지원 검토 상태 변경                      |
| POST   | `/api/team-recruitments/:recruitmentId/applications/:applicationId/invite` | 모집자    | 팀 합류 제안 발송                        |
| PUT    | `/api/team-join-offers/:id/respond`                                        | 초대 대상 | 합류 수락·거절                           |

### 모집 범위

```json
{
  "recruitment_scope": "NATIONWIDE",
  "school_domain": null
}
```

- `NATIONWIDE`: 모든 회원 접근 가능
- `SCHOOL`: `email_verified=true`, `account_type=STUDENT`, 같은 `school_domain`만 접근 가능

### 지원 상태

- `APPLIED`: 지원 완료
- `REVIEWING`: 모집자 검토
- `JOIN_OFFERED`: 합류 제안
- `APPROVED` / `ACCEPTED`: 합류 확정
- `REJECTED`: 거절
- `CANCELED`: 지원자 취소

상태 전이는 `application_status_events`에 기록하고 상세 API에서 timeline으로 조합한다.

## 6. 지원서 템플릿

| Method | Path                                     | 인증 | 설명           |
| ------ | ---------------------------------------- | ---- | -------------- |
| GET    | `/api/application-templates`             | 필요 | 내 템플릿 목록 |
| POST   | `/api/application-templates`             | 필요 | 템플릿 생성    |
| PUT    | `/api/application-templates/:templateId` | 본인 | 템플릿 수정    |
| DELETE | `/api/application-templates/:templateId` | 본인 | 템플릿 삭제    |

- 제목 최대 80자
- 본문 최대 2,000자
- 사용자당 기본 템플릿은 하나만 유지

## 7. 팀 활동·목표·위젯

| Method | Path                         | 인증 | 설명                         |
| ------ | ---------------------------- | ---- | ---------------------------- |
| GET    | `/my-teams`                  | 필요 | 내 진행 팀                   |
| GET    | `/users/:userId/teams`       | 본인 | 사용자 팀과 역할             |
| GET    | `/teams/:teamId/members`     | 팀원 | 팀원 목록                    |
| PUT    | `/teams/:teamId/name`        | 팀장 | 진행 중 활동 프로젝트명 수정 |
| PUT    | `/team-members/:teamId/part` | 본인 | 내 역할명 수정               |
| POST   | `/teams/:teamId/complete`    | 팀장 | 팀 종료·지난 활동 생성       |
| GET    | `/teams/:teamId/progress`    | 팀원 | 진행률 집계                  |
| GET    | `/teams/:teamId/daily-todos` | 팀원 | 오늘 이슈트래커 데이터       |
| GET    | `/teams/:teamId/calendar`    | 팀원 | 월 캘린더 데이터             |
| GET    | `/teams/:teamId/heatmap`     | 팀원 | 월별 완료 히트맵             |
| GET    | `/todos/:teamId`             | 팀원 | 내 범위별 목표               |
| GET    | `/teams/:teamId/todos`       | 팀원 | 팀원 목표 조회               |
| POST   | `/todos`                     | 팀원 | 내 목표 추가                 |
| POST   | `/teams/:teamId/todos`       | 팀원 | 팀원 목표 추가               |
| POST   | `/todos/period`              | 팀원 | 기간 일일 목표 생성          |
| PUT    | `/todos/:todoId`             | 팀원 | 제목·상태 수정               |
| DELETE | `/todos/:todoId`             | 팀원 | 목표 삭제                    |

### 기간 목표 생성

```json
{
  "team_id": 3,
  "title": "매일 자료 조사",
  "start_date": "2026-08-12",
  "end_date": "2026-08-20",
  "color": "#7A5AF8"
}
```

- 일일 목표에만 적용
- 최대 366일
- 동일 날짜에 미완료 기간 목표 최대 3개
- 중복 제목·날짜는 생성하지 않고 `skipped_count`로 반환

## 8. 공지·댓글·알림

| Method | Path                                        | 인증   | 설명                       |
| ------ | ------------------------------------------- | ------ | -------------------------- |
| GET    | `/teams/:teamId/notices`                    | 팀원   | 공지 목록과 댓글 수        |
| GET    | `/teams/:teamId/notices/:noticeId`          | 팀원   | 공지·댓글 상세             |
| POST   | `/teams/:teamId/notices`                    | 팀원   | 공지 작성                  |
| PUT    | `/teams/:teamId/notices/:noticeId`          | 작성자 | 공지 수정                  |
| POST   | `/teams/:teamId/notices/:noticeId/comments` | 팀원   | 댓글 작성·관련 사용자 알림 |
| GET    | `/notifications/unread-count`               | 필요   | 읽지 않은 알림 수          |
| GET    | `/notifications`                            | 필요   | 알림 목록                  |
| PUT    | `/notifications/read`                       | 필요   | 알림 읽음 처리             |

## 9. 지난 활동·미니포트폴리오·수상

| Method | Path                                                 | 인증 | 설명                |
| ------ | ---------------------------------------------------- | ---- | ------------------- |
| GET    | `/users/:userId/past-activities`                     | 본인 | 지난 활동 목록      |
| GET    | `/users/:userId/past-activities/:portfolioId`        | 본인 | 미니포트폴리오 상세 |
| PUT    | `/users/:userId/past-activities/:portfolioId`        | 본인 | 사용자 편집 저장    |
| GET    | `/users/:userId/past-activities/:portfolioId/pdf`    | 본인 | PDF 다운로드        |
| POST   | `/users/:userId/past-activities/:portfolioId/images` | 본인 | 활동 이미지 업로드  |
| GET    | `/users/:userId/awards`                              | 본인 | 수상 요약·목록      |
| PUT    | `/users/:userId/awards/:portfolioId`                 | 본인 | 수상 내역 upsert    |

수상 실수령액은 `tax_applied=true`일 때 입력 상금의 78%로 계산한다.

## 10. 사용자·평가·업로드

| Method | Path                                                        | 인증        | 설명                 |
| ------ | ----------------------------------------------------------- | ----------- | -------------------- |
| GET    | `/api/user/:id`                                             | 필요        | 사용자 정보          |
| PUT    | `/api/user/:id`                                             | 본인        | 개인정보 수정        |
| PUT    | `/api/user/:id/password`                                    | 본인        | 비밀번호 수정        |
| DELETE | `/api/delete-user/:id`                                      | 본인        | 계정 삭제            |
| POST   | `/api/users/batch`                                          | 필요        | 사용자 다건 조회     |
| GET    | `/api/participations/user/:userId`                          | 본인        | 참여 기록            |
| GET    | `/api/reviews/existing/:reviewerId/:revieweeId/:activityId` | 필요        | 기존 평가 조회       |
| POST   | `/api/reviews`                                              | 평가자 본인 | 평가 생성·수정       |
| GET    | `/api/user/:id/evaluations`                                 | 필요        | 받은 평가 집계       |
| GET    | `/api/user/:id/reviews`                                     | 필요        | 받은 리뷰 목록       |
| GET    | `/api/user/:id/activities`                                  | 필요        | 평가 가능한 활동     |
| POST   | `/api/upload/profile/:userId`                               | 본인        | 프로필 이미지 업로드 |

이미지는 확장자, MIME, 파일 시그니처를 모두 검증하고 서버가 생성한 안전한 파일명을 사용한다. 원본 파일명과 경로를 신뢰하지 않는다.

## 11. 피드백·관리자·운영

| Method | Path                                | 인증      | 설명                     |
| ------ | ----------------------------------- | --------- | ------------------------ |
| GET    | `/api/developer-feedback/mine`      | 필요      | 내 피드백 목록           |
| POST   | `/api/developer-feedback`           | 필요      | 개선·오류·기타 의견 등록 |
| GET    | `/api/admin/overview`               | 관리자    | 활동·크롤러·오류 요약    |
| GET    | `/api/admin/activities`             | 관리자    | 운영 활동 목록           |
| PUT    | `/api/admin/activities/:activityId` | 관리자    | 활동 숨김·정보 수정      |
| POST   | `/api/admin/crawler/run`            | 관리자    | 크롤러 수동 실행         |
| GET    | `/api/health`                       | 없음      | 프로세스 상태            |
| GET    | `/api/db-health`                    | 없음      | DB 연결 상태             |
| GET    | `/api/ops/status`                   | Ops token | 운영 메트릭·크롤러 상태  |

## 12. 웹 구현 전 API 개선 항목

1. OpenAPI 3.1 파일을 서버 계약의 단일 원본으로 추가한다.
2. 목록 응답을 `{items, pagination}`으로 통일한다.
3. 오류 응답에 `code`, `message`, `details`, `requestId`를 도입한다.
4. 브라우저 인증을 HttpOnly cookie로 전환하고 CSRF 방어를 설계한다.
5. 친구·쪽지·마이페이지 메뉴 순서·운영자 피드백 답장 API를 추가한다.
6. 자기 자신이 아닌 사용자 ID path 접근에 대한 권한 검사를 전수 점검한다.

## 13. 호환 API

다음 endpoint는 기존 앱 호환 목적으로 남아 있다. 신규 웹 코드는 사용하지 않는다.

| Method | Path                | 대체 API                                                 |
| ------ | ------------------- | -------------------------------------------------------- |
| POST   | `/login`            | `POST /api/login`                                        |
| POST   | `/register`         | `POST /api/register`                                     |
| GET    | `/api/applications` | 목적에 따라 `/api/my-applications` 또는 모집별 지원 목록 |
| POST   | `/api/upload`       | 목적별 profile·portfolio 업로드 API                      |

호환 API를 제거할 때는 앱 사용처 검색, deprecation 기간, 호출 로그 확인을 선행한다.
