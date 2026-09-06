# 기여 가이드

## 작업 흐름

1. 작업 전 GitHub Issue를 생성합니다.
2. `develop`을 기준으로 작업 브랜치를 만듭니다.
3. 테스트와 검토가 끝나면 커밋하고 원격 브랜치에 푸시합니다.
4. Draft Pull Request를 만들고, 검토가 끝날 때까지 병합하지 않습니다.

## 커밋 메시지

다음 형식을 사용합니다.

```text
type(scope): 한글 작업 요약
```

`type`은 변경 목적을, `scope`는 영향받는 기능 영역을 나타냅니다. 제목은 마침표 없이 72자 이내로 작성합니다.

| type | 사용 시점 |
| --- | --- |
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `security` | 보안 개선 |
| `refactor` | 동작을 바꾸지 않는 구조 개선 |
| `test` | 테스트 추가·수정 |
| `docs` | 문서 변경 |
| `style` | UI 또는 포맷 변경 |
| `perf` | 성능 개선 |
| `build` | 빌드·의존성 변경 |
| `ci` | CI/CD 변경 |
| `chore` | 기타 유지보수 |

권장 `scope`: `auth`, `home`, `info`, `activity`, `matching`, `mypage`, `notification`, `admin`, `crawler`, `server`, `database`, `ios`, `android`, `web`.

예시:

```text
feat(activity): 기간 목표 추가 기능 구현
fix(matching): 학교 인증 사용자 조회 오류 수정
security(auth): 토큰 인증 우회 차단
```

## Pull Request

PR 제목에도 동일한 `type(scope): 한글 작업 요약` 형식을 사용합니다.

본문은 템플릿의 모든 항목을 채웁니다. 특히 수정하거나 추가·삭제한 파일은 `## 수정 파일`에 경로와 변경 이유를 기록합니다. Issue를 닫는 연결 문구는 PR 본문에만 `Closes #번호` 형식으로 작성합니다.

CodeRabbit은 Draft PR을 포함해 자동 검토하며, 리뷰와 답글은 한국어로 작성합니다. CodeRabbit의 자동 고수준 요약은 PR 본문에 추가하지 않습니다.
