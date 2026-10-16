# beadv8_8_LMS_FE
백엔드 단기심화 8기 8팀 남(은)자들팀의 FE 레포지토리입니다.

## 로컬 개발

Node 24(`.node-version`)와 pnpm(`package.json`의 `packageManager`, corepack으로 설치)을 쓴다.

```sh
corepack enable
pnpm install
pnpm dev            # http://localhost:5173, /api는 로컬 BE(localhost:8080)로 프록시
```

| 명령 | 설명 |
| --- | --- |
| `pnpm build` | 타입 체크(`tsc -b`) 후 빌드 |
| `pnpm lint` | oxlint |
| `pnpm test` | Vitest 단위·컴포넌트 테스트 (`test:watch`는 감시 모드) |
| `pnpm format` | Prettier로 포맷 적용 (`format:check`는 CI에서 검사만) |

import는 `@/`가 `src/`를 가리킨다(`import { api } from '@/shared/api/client'`).

### 개발 서버 도구

- **역할 전환 스트립**: 개발 서버 화면 맨 위의 `DEV 역할` 버튼으로 로컬 BE 테스트 계정에 로그인한다(`POST /api/v1/members/local-login`). 로컬 BE에 local-login이 켜져 있어야 한다. 운영 번들에는 들어가지 않는다.
- **HP 충전(토스페이먼츠 테스트 결제)**: `.env.local`에 `VITE_TOSS_PAYMENTS_CLIENT_KEY=test_ck_…`를 넣는다. 비워 두면 충전 버튼이 꺼진다. 배포 값은 [배포](docs/deploy.md#환경변수) 참고.

### 폴더

| 경로 | 내용 |
| --- | --- |
| `src/app/` | 라우터(역할별 가드), 앱 셸·내비, QueryClient |
| `src/shared/api/` | API 클라이언트: CSRF 헤더, `RsData` 언랩, `ProblemDetail` → `ApiError` |
| `src/shared/auth/` | 내 정보(`meQuery`), 역할, 로그인·로그아웃 |
| `src/shared/ui/`, `src/shared/styles/` | 공용 컴포넌트, 디자인 토큰(`docs/mockup-ui.html` 기준) |
| `src/features/{모듈}/` | BE 모듈별 API·화면 (member, lecture, appearance, billing, chat, support, admin …) |
| `src/pages/` | 공통 화면(자리표시, 404, 오류) |
| `src/test/` | 테스트 설정, MSW 서버, 테스트 전용 응답(fixture) |

## 문서

- [배포](docs/deploy.md): 환경 주소, 배포 흐름, API 호출·환경변수 규칙
- [UI 목업](docs/mockup-ui.html): 역할별 화면 프레임과 라우트·API 안. 브라우저로 열어 본다.
