# 배포

서버 구성과 운영 문서는 BE 레포 [docs/deploy](https://github.com/prgrms-be-adv-devcourse/beadv8_8_LMS_BE/blob/dev/docs/deploy/README.md)에 있다. 여기서는 FE 개발자가 알아야 할 것만 정리한다.

| 환경 | 주소 | 브랜치 |
| --- | --- | --- |
| prod | https://hapbang.duckdns.org | `main` |
| dev | https://dev.hapbang.duckdns.org | `dev` |

API 명세(dev): https://dev.hapbang.duckdns.org/swagger-ui.html

## 배포 흐름

```
PR → dev/main 병합 → GitHub Actions
  ci      npm ci → lint → build(tsc 포함)
  build   이미지 빌드 → GHCR push   :dev|:latest, :sha-<커밋>
  deploy  서버에서 해당 환경의 web 컨테이너만 교체 → healthy 확인
```

- FE 배포는 **web만** 바꾼다. BE·DB에는 영향이 없다.
- 새 web이 응답하지 않으면 이전 버전으로 자동 롤백되고 배포가 실패로 표시된다.
- 롤백: Actions → 되돌릴 버전의 Deploy run → `deploy` job만 재실행.
- 서버는 09:00~18:00에만 켜져 있다. 그 외 시간의 배포는 SSH 타임아웃으로 실패하므로 다음 날 `deploy` job을 재실행한다.

## 코드 작성 규칙

**API는 상대 경로로 호출한다.**

```ts
fetch('/api/v1/lectures')                        // ✅
fetch('https://dev.hapbang.duckdns.org/api/...')  // ❌ 환경마다 이미지를 따로 빌드해야 한다
```

같은 출처(origin)라 CORS 설정이 필요 없고, 세션 쿠키도 그대로 전송된다. 로컬 개발에서는 `vite.config.ts`의 `server.proxy`로 `/api`를 로컬 BE(`http://localhost:8080`)에 연결한다.

**라우팅**: 서버의 nginx가 없는 경로를 `index.html`로 돌려주므로(SPA fallback) 클라이언트 라우터를 그대로 쓰면 된다. `/api`, `/swagger-ui`, `/v3/api-docs`로 시작하는 경로는 BE로 가므로 FE 라우트로 쓰지 않는다.

## 환경변수

Vite의 `VITE_*` 변수는 **빌드할 때 JS 번들에 그대로 박혀 누구나 볼 수 있다.**

- 비밀값(API 키, 토큰 등)을 넣지 않는다. 비밀이 필요한 기능은 BE를 통한다.
- `.env`, `.env.*`는 커밋하지 않는다.
- 이미지 빌드에는 환경별 값을 넣지 않는다. 환경마다 꼭 달라야 하는 공개 값이 생기면 `deploy.yml` 빌드 단계에 build-arg를 추가해야 하므로 팀과 먼저 상의한다.

## 파일

| 파일 | 역할 |
| --- | --- |
| `Dockerfile` | node로 빌드 → nginx에서 `dist/` 서빙(80) |
| `nginx.conf` | SPA fallback, `/assets/` 장기 캐시, `index.html` 캐시 안 함 |
| `.github/workflows/ci.yml` | PR마다 lint·build |
| `.github/workflows/deploy.yml` | `main`·`dev` 병합 시 빌드·배포 |
