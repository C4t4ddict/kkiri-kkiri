# 공모전 크롤러

이슈 #11 범위로 위비티와 씽굿의 공개 공모전 정보를 수집해 `activitys` 형식으로 정규화합니다. 현재 서버 스택에 맞춰 Node.js와 `mysql2`를 사용하며, HTML 파싱에는 `cheerio`를 사용합니다.

## 저장 구조

- `activitys`: 앱에서 사용하는 정규화 데이터. `(source_name, source_item_id)`로 중복 없이 갱신합니다.
- `crawler_raw_items`: 상세 페이지 원문 HTML과 정규화 JSON을 해시별로 보관합니다. 원문이 바뀔 때만 새 버전이 생깁니다.
- `crawler_runs`: 실행별 발견·저장·오류 건수와 상태를 기록합니다.
- `crawler_errors`: 사이트/항목/단계별 오류를 기록합니다.

첫 DB 저장 실행 시 필요한 컬럼과 테이블을 안전하게 추가합니다. 앱에는 `topic_category`를 기준으로 세부 분야가 노출됩니다.

## 실행

```bash
cd server
npm install
npm run crawl:competitions:dry
npm run crawl:competitions -- --source all --pages 3 --limit 50
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
CRAWLER_PAGES=3
CRAWLER_LIMIT=50
```

기본 설정은 사이트별 3페이지, 최대 50건을 조회하고 `robots.txt`를 확인하며 요청 사이에 1초를 둡니다. 한 사이트나 한 항목이 실패해도 나머지 항목은 계속 처리되며 실패 내용은 DB에 남습니다.

## 자동 업데이트

API 서버를 실행하면 기본적으로 30초 뒤 첫 수집을 시작하고 이후 6시간마다 다시 수집합니다. 같은 서버 프로세스 안에서는 이전 수집이 끝나기 전에 다음 수집을 중복 실행하지 않습니다.

```dotenv
CRAWLER_AUTO_ENABLED=true
CRAWLER_AUTO_INTERVAL_HOURS=6
CRAWLER_AUTO_INITIAL_DELAY_SECONDS=30
```

자동 수집을 끄려면 `CRAWLER_AUTO_ENABLED=false`로 설정합니다. 서버 인스턴스를 여러 개 운영할 때는 중복 수집을 피하도록 한 인스턴스에서만 활성화하거나, 모든 인스턴스에서 자동 수집을 끄고 외부 스케줄러가 `npm run crawl:competitions`를 호출하도록 구성합니다.

현재 크롤러는 MySQL의 `GET_LOCK`을 사용하므로 여러 서버 인스턴스에서 스케줄이 동시에 실행되어도 실제 수집 프로세스는 하나만 DB를 갱신합니다. 운영에서는 앱 API와 크롤러의 CPU·네트워크 부하를 분리하기 위해 `CRAWLER_AUTO_ENABLED=false`로 설정하고 별도 스케줄러에서 아래 명령을 실행하는 방식을 권장합니다.

```bash
cd server
npm run crawl:competitions -- --source all --pages 3 --limit 50
```

활동 탭 기능 확인용 예시 팀은 현재 접수 중인 공모전을 기준으로 아래 명령으로 생성하거나 갱신할 수 있습니다.

```bash
npm run seed:demo-activity
```
