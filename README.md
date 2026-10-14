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
| `pnpm format` | Prettier로 포맷 적용 (`format:check`는 CI에서 검사만) |

import는 `@/`가 `src/`를 가리킨다(`import App from '@/App.tsx'`).

## 문서

- [배포](docs/deploy.md): 환경 주소, 배포 흐름, API 호출·환경변수 규칙
- [UI 목업](docs/mockup-ui.html): 역할별 화면 프레임과 라우트·API 안. 브라우저로 열어 본다.
