# KKIRI Web Design System Generator

Figma MCP Starter 한도와 무관하게 끼리끼리 웹의 전체 화면과 공통 컴포넌트를 현재 Figma 파일에 생성하는 로컬 개발 플러그인입니다.

## 생성 항목

- Foundations: 색상, 타이포그래피, 간격 토큰
- Components: 버튼, 입력창, 내비게이션, 카드, 리스트, 상태, 모달
- Screens: 로그인과 인증 후 전체 13개 라우트
- Modal states: 커리큘럼 추가, 지원서 작성·삭제 상태

생성된 화면은 공통 컴포넌트의 인스턴스를 사용하므로 `KKIRI · 01 Components` 페이지에서 원본을 수정하면 연결된 화면에 반영됩니다.

## 실행

1. Figma 데스크톱 앱에서 대상 디자인 파일을 엽니다.
2. `Plugins → Development → Import plugin from manifest...`를 선택합니다.
3. 이 폴더의 `manifest.json`을 선택합니다.
4. `Plugins → Development → KKIRI Web Design System Generator`를 실행합니다.

기존 페이지는 삭제하지 않으며, 같은 이름이 있으면 새 페이지 이름 뒤에 번호를 붙입니다.
