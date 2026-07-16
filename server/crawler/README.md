# 공모전 크롤러

이슈 #11 범위로 위비티와 씽굿의 공개 공모전 정보를 수집해 `activitys` 형식으로 정규화합니다. 현재 서버 스택에 맞춰 Node.js와 `mysql2`를 사용하며, HTML 파싱에는 `cheerio`를 사용합니다.

## 저장 구조

- `activitys`: 앱에서 사용하는 정규화 데이터. `(source_name, source_item_id)`로 중복 없이 갱신합니다.
- `crawler_raw_items`: 상세 페이지 원문 HTML과 정규화 JSON을 해시별로 보관합니다. 원문이 바뀔 때만 새 버전이 생깁니다.
- `crawler_runs`: 실행별 발견·저장·오류 건수와 상태를 기록합니다.
- `crawler_errors`: 사이트/항목/단계별 오류를 기록합니다.

첫 DB 저장 실행 시 필요한 컬럼과 테이블을 안전하게 추가합니다. 기존 `activitys` 데이터는 수정하지 않습니다.

## 실행

```bash
cd server
npm install
npm run crawl:competitions:dry
npm run crawl:competitions -- --source all --pages 2 --limit 20
```

사이트 하나만 검증할 수 있습니다.

```bash
npm run crawl:competitions -- --source wevity --limit 5 --dry-run
npm run crawl:competitions -- --source thinkcontest --limit 5 --dry-run
```

## 환경 변수

기존 `server/.env`의 DB 설정을 그대로 사용합니다.

```dotenv
CRAWLER_USER_AGENT=kkiri-kkiri-crawler/1.0 (+https://github.com/C4t4ddict/kkiri-kkiri)
CRAWLER_REQUEST_DELAY_MS=1000
CRAWLER_TIMEOUT_MS=15000
CRAWLER_RETRIES=3
CRAWLER_RESPECT_ROBOTS=true
CRAWLER_PAGES=1
CRAWLER_LIMIT=20
```

기본 설정은 `robots.txt`를 확인하고 사이트별 요청 사이에 1초를 둡니다. 한 사이트나 한 항목이 실패해도 나머지 항목은 계속 처리되며 실패 내용은 DB에 남습니다.
