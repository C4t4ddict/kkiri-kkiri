# 저비용 트래픽 운영 가이드

이 문서는 1인 운영 단계에서 고정비를 늘리지 않고 끼리끼리의 병목과 장애 전파를 줄이는 기준을 정리한다.

## 이번에 적용한 보호 장치

- 활동 목록은 DB 전체 조회 후 자르지 않고 `LIMIT/OFFSET`으로 필요한 행만 조회한다.
- 짧은 메모리 캐시와 동시 요청 합치기로 같은 조회가 한꺼번에 DB로 몰리는 현상을 줄인다.
- API, 로그인, 이메일 인증, 이미지 업로드에 별도 요청 제한을 둔다.
- DB 연결 수와 대기열을 제한해 과부하가 서버 전체 메모리 고갈로 번지지 않게 한다.
- 응답 압축, 업로드 이미지 장기 캐시, 비동기 비밀번호 검증과 파일 저장을 사용한다.
- 크롤러와 보관 작업은 웹 서버와 분리할 수 있으며, 여러 API 인스턴스에서 중복 실행하지 않는다.
- `/api/ready`는 DB가 준비된 인스턴스에만 트래픽을 보내기 위한 준비 상태를 제공한다.
- 종료 신호를 받으면 새 요청을 막고 기존 요청과 DB 연결을 정리한다.

## 가장 저렴한 시작 구성

1. 웹 정적 파일은 무료 정적 호스팅을 사용한다.
2. API는 작은 단일 인스턴스 하나로 시작하고 `RUN_BACKGROUND_JOBS=true`도 그 인스턴스 하나에서만 사용한다.
3. MySQL은 처음에는 작은 인스턴스를 쓰되, 매일 다른 저장소로 백업한다.
4. 이미지는 현재 로컬 저장을 유지할 수 있다. 디스크와 전송량이 커질 때만 객체 저장소/CDN으로 옮기고 `PUBLIC_MEDIA_BASE_URL`을 설정한다.
5. API 인스턴스가 하나인 동안에는 Redis를 추가하지 않는다. 인스턴스를 둘 이상 운영할 때 요청 제한과 캐시를 Redis 같은 공유 저장소로 교체한다.

무료 요금제는 정책이 자주 바뀌므로 특정 업체보다 위 구조를 기준으로 선택한다. 처음부터 Kubernetes, 유료 Redis, 메시지 큐를 도입하지 않는다.

## 권장 환경값

```env
DB_CONNECTION_LIMIT=10
DB_QUEUE_LIMIT=100
DB_CONNECT_TIMEOUT_MS=10000
ACTIVITY_CACHE_TTL_MS=30000
ACTIVITY_CACHE_MAX_ENTRIES=100
ACTIVITY_COMPATIBILITY_LIMIT=200
API_RATE_LIMIT_MAX=600
API_RATE_LIMIT_WINDOW_MS=60000
RUN_BACKGROUND_JOBS=true
ALLOW_DUMMY_LOGIN=false
```

프록시나 로드밸런서 바로 뒤에서 운영할 때만 실제 프록시 홉 수에 맞춰 `TRUST_PROXY_HOPS`를 설정한다. 잘못 설정하면 IP 기반 요청 제한을 우회할 수 있다.

## 배포 전 확인

```powershell
npm --prefix server test
npm --prefix web run lint
npm --prefix web run build
npm --prefix server run test:load -- "http://127.0.0.1:3000/api/activities/open?page=1&limit=20" 100 10
```

- `/api/ready`가 HTTP 200인지 확인한다.
- 운영 토큰을 설정한 뒤 `/api/ops/status`에서 메모리, 요청 수, DB 연결 수, 캐시 대기 작업을 확인한다.
- 로그에 DB 대기열 초과, 429 응답, 5xx 응답이 급증하는지 본다.

## 돈을 쓰기 시작할 기준

- 피크 시간의 API p95 응답 시간이 500ms를 지속적으로 넘는다.
- DB CPU가 지속적으로 높거나 느린 쿼리가 반복된다.
- 업로드 디스크가 빠르게 증가하거나 이미지 전송량이 서버 비용의 주된 비중이 된다.
- 단일 API 장애가 실제 매출이나 핵심 이용 흐름에 영향을 준다.

이때도 순서는 쿼리와 인덱스 점검 → 이미지 객체 저장소/CDN → API 인스턴스 추가 → 공유 캐시 순으로 진행한다.
