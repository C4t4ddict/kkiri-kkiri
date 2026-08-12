# 데이터베이스 ERD

## 1. 범위와 주의사항

이 문서는 서버 코드의 `CREATE TABLE`, `ALTER TABLE`, 조회·저장 SQL을 기준으로 작성한 **논리 ERD**다. 현재 일부 테이블은 DB 레벨 `FOREIGN KEY` 없이 인덱스와 애플리케이션 로직으로 관계를 유지한다. 아래 관계선은 참조 의미를 나타내며 실제 FK 선언을 보장하지 않는다.

`activitys`는 현재 운영 코드의 테이블명을 그대로 표기한다. 향후 `activities`로 이름을 바로잡으려면 호환 뷰 또는 단계적 마이그레이션이 필요하다.

## 2. 인증·사용자

```mermaid
erDiagram
  USERS ||--o{ PASSWORD_RESET_TOKENS : requests
  USERS ||--o{ USER_FAVORITE_ACTIVITIES : saves
  USERS ||--o{ DEVELOPER_FEEDBACK : writes
  SCHOOL_EMAIL_DOMAINS ||--o{ USERS : verifies

  USERS {
    int id PK
    varchar email UK
    varchar password
    varchar name
    varchar department
    varchar student_number
    date birth
    varchar profile_picture
    text self_intro
    boolean email_verified
    varchar account_type
    varchar school_domain
    varchar school_name
    boolean is_admin
  }
  SCHOOL_EMAIL_DOMAINS {
    varchar school_domain PK
    varchar school_name
    boolean is_active
    datetime created_at
    datetime updated_at
  }
  EMAIL_VERIFICATIONS {
    bigint verification_id PK
    varchar email
    varchar purpose
    char code_hash
    tinyint attempts
    datetime expires_at
    datetime verified_at
    datetime consumed_at
    varchar requested_ip
  }
  PASSWORD_RESET_TOKENS {
    bigint reset_id PK
    int user_id
    char token_hash UK
    datetime expires_at
    datetime used_at
  }
  DEVELOPER_FEEDBACK {
    bigint feedback_id PK
    int user_id
    varchar category
    text content
    varchar platform
    varchar status
  }
  USER_FAVORITE_ACTIVITIES {
    int user_id PK
    int activity_id PK
    datetime created_at
  }
```

`email_verifications.email`은 가입 전 사용자를 지원하므로 `users.id` FK가 아니다. 인증 코드와 재설정 토큰은 원문이 아니라 SHA-256 hash를 저장한다.

## 3. 활동 정보·크롤러

```mermaid
erDiagram
  ACTIVITYS ||--o{ USER_FAVORITE_ACTIVITIES : saved_as
  ACTIVITYS ||--o{ TEAM_RECRUITMENTS : selected_for
  CRAWLER_RUNS ||--o{ CRAWLER_RAW_ITEMS : collects
  CRAWLER_RUNS ||--o{ CRAWLER_ERRORS : records
  ACTIVITYS ||--o{ CRAWLER_RAW_ITEMS : normalized_to

  ACTIVITYS {
    int activity_id PK
    varchar title
    varchar target_audience
    varchar organizer
    varchar location
    date operation_period_start
    date operation_period_end
    date application_period_start
    date application_period_end
    varchar points
    text prize_details
    varchar contact
    text details
    varchar category
    varchar topic_category
    varchar main_image_url
    varchar source_name
    varchar source_item_id
    varchar source_url
    varchar official_url
    text source_categories
    datetime last_crawled_at
    boolean is_hidden
  }
  CRAWLER_RUNS {
    bigint run_id PK
    varchar source_name
    varchar status
    int discovered_count
    int saved_count
    int error_count
    datetime started_at
    datetime finished_at
    text error_message
  }
  CRAWLER_RAW_ITEMS {
    bigint raw_item_id PK
    bigint run_id
    int activity_id
    varchar source_name
    varchar source_item_id
    varchar source_url
    char content_hash
    mediumtext raw_html
    longtext normalized_json
    datetime fetched_at
  }
  CRAWLER_ERRORS {
    bigint error_id PK
    bigint run_id
    varchar source_name
    varchar source_item_id
    varchar source_url
    varchar stage
    text error_message
  }
```

주요 유일 조건은 `activitys(source_name, source_item_id)`와 `crawler_raw_items(source_name, source_item_id, content_hash)`다.

## 4. 모집·지원·팀

```mermaid
erDiagram
  USERS ||--o{ TEAM_RECRUITMENTS : owns
  ACTIVITYS ||--o{ TEAM_RECRUITMENTS : targets
  TEAM_RECRUITMENTS ||--o{ APPLICATIONS : receives
  USERS ||--o{ APPLICATIONS : submits
  USERS ||--o{ APPLICATION_TEMPLATES : owns
  APPLICATION_TEMPLATES o|--o{ APPLICATIONS : used_by
  APPLICATIONS ||--o{ APPLICATION_STATUS_EVENTS : changes
  APPLICATIONS ||--o| TEAM_JOIN_OFFERS : creates
  TEAM_RECRUITMENTS ||--o| TEAMS : forms
  TEAMS ||--o{ TEAM_MEMBERS : includes
  USERS ||--o{ TEAM_MEMBERS : joins

  TEAM_RECRUITMENTS {
    int recruitment_id PK
    int team_id
    int activity_id
    int owner_user_id
    varchar post_name
    varchar activity_name
    varchar activity_type
    varchar meeting_type
    varchar recruitment_scope
    varchar school_domain
    int required_members
    date activity_start_date
    date activity_end_date
    varchar status
    datetime deleted_at
  }
  APPLICATIONS {
    int application_id PK
    int recruitment_id
    int applicant_id
    int template_id
    text memo
    varchar application_status
    datetime applied_at
  }
  APPLICATION_TEMPLATES {
    int template_id PK
    int user_id
    varchar title
    text content
    boolean is_default
    datetime created_at
    datetime updated_at
  }
  APPLICATION_STATUS_EVENTS {
    int event_id PK
    int application_id
    varchar status
    int actor_id
    datetime created_at
  }
  TEAM_JOIN_OFFERS {
    int offer_id PK
    int application_id UK
    int recruitment_id
    int team_id
    int inviter_id
    int invitee_id
    varchar status
    datetime created_at
    datetime responded_at
  }
  TEAMS {
    int team_id PK
    int recruitment_id
    int leader_user_id
    varchar team_name
    date due_date
    varchar status
    varchar activity_status
  }
  TEAM_MEMBERS {
    int team_id PK
    int user_id PK
    varchar role
    varchar part
  }
```

## 5. 활동 운영·알림

```mermaid
erDiagram
  TEAMS ||--o{ TODOS : owns
  USERS ||--o{ TODOS : assigned
  TEAMS ||--o{ TEAM_NOTICES : owns
  USERS ||--o{ TEAM_NOTICES : authors
  TEAM_NOTICES ||--o{ NOTICE_COMMENTS : has
  USERS ||--o{ NOTICE_COMMENTS : authors
  USERS ||--o{ USER_NOTIFICATIONS : receives
  TEAM_JOIN_OFFERS o|--o{ USER_NOTIFICATIONS : notifies

  TODOS {
    int todo_id PK
    int team_id
    int assigned_user_id
    varchar title
    varchar status
    varchar scope_type
    date scope_start_date
    date scope_end_date
    varchar range_group_id
    date range_start_date
    date range_end_date
    varchar range_color
    datetime completed_at
    datetime created_at
    datetime updated_at
  }
  TEAM_NOTICES {
    int notice_id PK
    int team_id
    int author_id
    varchar title
    text content
    datetime created_at
    datetime updated_at
  }
  NOTICE_COMMENTS {
    int comment_id PK
    int notice_id
    int author_id
    text content
    datetime created_at
  }
  USER_NOTIFICATIONS {
    int notification_id PK
    int user_id
    int team_id
    int notice_id
    int offer_id
    varchar type
    varchar title
    varchar content
    boolean is_read
    datetime created_at
  }
```

`todos.status`는 현재 `미진행`, `진행중`, `완료`를 사용하고 `scope_type`은 `일일`, `주간`, `월간`, `전체`를 사용한다. 기간 목표는 같은 `range_group_id`를 가진 일일 목표 묶음이며 동시 미완료 구간은 날짜별 최대 3개다.

## 6. 지난 활동·포트폴리오·평가

```mermaid
erDiagram
  USERS ||--o{ USER_ACTIVITY_PARTICIPATIONS : participates
  TEAMS ||--o{ USER_ACTIVITY_PARTICIPATIONS : archived_from
  USERS ||--o{ MINIPORTFOLIOS : owns
  TEAMS ||--o{ MINIPORTFOLIOS : summarized_from
  MINIPORTFOLIOS ||--o| PORTFOLIO_EDITS : customized_by
  MINIPORTFOLIOS ||--o| USER_AWARDS : awarded_as
  USERS ||--o{ REVIEWS : writes
  USERS ||--o{ REVIEWS : receives

  USER_ACTIVITY_PARTICIPATIONS {
    int participation_id PK
    int user_id
    int team_id
    varchar participated_at
    json participated_with
  }
  MINIPORTFOLIOS {
    int portfolio_id PK
    int user_id
    int team_id
    int recruitment_id
    varchar activity_name
    varchar activity_type
    varchar role
    varchar goals
    varchar period
    date period_start
    date period_end
    json completed_tasks
    text summary
    varchar archived_reason
    datetime archived_at
  }
  PORTFOLIO_EDITS {
    int portfolio_id PK
    int user_id
    varchar custom_title
    varchar custom_activity_type
    varchar custom_role
    text custom_summary
    json achievements
    text reflection
    json image_urls
    json links
  }
  USER_AWARDS {
    int award_id PK
    int user_id
    int portfolio_id UK
    boolean is_awarded
    varchar award_title
    boolean has_prize
    bigint prize_amount
    boolean tax_applied
  }
  REVIEWS {
    int review_id PK
    int reviewer_id
    int reviewee_id
    int related_team_id
    int review_high
    int review_medium
    int review_low
    text comment
  }
```

## 7. 데이터 무결성 규칙

- 사용자 이메일은 정규화한 소문자로 유일해야 한다.
- 학교 모집의 `school_domain`은 작성자의 인증 학교와 일치해야 한다.
- 관심 활동은 `(user_id, activity_id)`당 하나만 존재한다.
- 미니포트폴리오는 `(user_id, team_id)`당 하나만 존재한다.
- 수상 내역은 `(user_id, portfolio_id)`당 하나만 존재한다.
- 합류 제안은 `application_id`당 하나만 존재한다.
- 지원서 템플릿 제목은 80자, 본문은 2,000자 이하로 정규화한다.
- 기간 목표는 최대 366일이며 승인된 6개 색상만 사용한다.
- 이미지 업로드는 허용 확장자·MIME·파일 시그니처를 모두 검증한다.

## 8. 후속 데이터 작업

1. 런타임 `ALTER TABLE`을 버전 관리되는 migration으로 이전한다.
2. 핵심 관계에 FK 적용 가능성을 검토하되 기존 고아 데이터 정리 후 진행한다.
3. `activitys` 명칭 변경 계획을 수립한다.
4. 친구·쪽지·마이페이지 메뉴 순서·운영자 답장 기능은 별도 테이블 설계가 필요하다.
5. 실제 운영 DB의 `information_schema`와 본 문서를 배포 전 대조한다.
