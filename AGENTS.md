# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

합방(hapbang): 인플루언서 강의 판매와 방송 출연(합방) 거래를 HP(1 HP = 1원)로 처리하는 서비스의 FE. React 19 + TypeScript + Vite 8 SPA이고, BE는 별도 레포(`beadv8_8_LMS_BE`, Spring)다.

## 명령

pnpm만 쓴다(`packageManager`로 버전 고정, Node 24는 `.node-version`). npm/yarn lockfile을 만들지 않는다.

```sh
pnpm dev            # /api → http://localhost:8080 (로컬 BE) 프록시
pnpm build          # tsc -b(타입 체크) 후 vite build
pnpm lint           # oxlint
pnpm format         # Prettier 적용 / format:check는 검사만
```

CI(`.github/workflows/ci.yml`)는 `format:check → lint → build` 순서로 돌고, 셋 다 통과해야 배포된다. 테스트 러너는 아직 없다.

## 화면 명세: `docs/mockup-ui.html`

확정된 UI 목업이다. 브라우저로 열면 역할별(유저 U-xx, 인플루언서 I-xx, 관리자 A-xx) 프레임을 넘겨 볼 수 있고, 프레임마다 라우트·API 안·적용 정책이 붙어 있다. 파일이 커서(약 330KB) 섹션 단위로 찾아 읽는다.

- `<style>`(6–642행): 디자인 토큰(`:root` CSS 변수, 다크 모드 포함)과 컴포넌트 클래스(`.btn.primary`, `.pill.ok`, `.panel` …). 앱 CSS는 이것을 그대로 옮긴다(Tailwind·UI 키트로 재작성하지 않는다). 534행 이후 `--fx-*`/에디터 셸은 목업 뷰어용이라 옮기지 않는다.
- 스크립트의 `/* ───── … ───── */` 주석이 섹션 경계다: 샘플 데이터, `ROLES`/`NAV`(역할별 메뉴·접근 권한), 공용 컴포넌트(`Pill`, `Head`, `Field`, `Tabs`, `Modal`, `Empty`), 화면별 컴포넌트, 프레임 정의(`route:`, API 안).
- 모바일 대응은 `@media`가 아니라 `@container app`이다.
- 역할: 비회원 / 유저 / 인플루언서 / 인증된 인플루언서 / 관리자. HP 종류는 색으로 고정한다(충전=`--charge` 파랑, 수익=`--earn` 초록, 보류=`--hold` 호박색).
- 목업의 `ctx` 전역 상태(지갑, 장부, 장바구니, 출연 등)와 `hold`/`unhold` 같은 잔액 계산은 프로토타입용이다. 실제로는 서버 데이터이므로 TanStack Query로 다루고 계산은 BE가 한다. 라우트·검색어·필터는 URL에 둔다.

라이브러리는 직접 구현보다 성숙한 것을 선호한다(팀 방침). 스타일은 목업 CSS(토큰 + CSS Modules), 서버 상태는 TanStack Query로 정했다.

## BE 연동

- **API는 상대 경로(`/api/v1/...`)로만 호출한다.** 운영·개발 모두 edge nginx가 같은 출처에서 `/api`를 BE로 넘기므로 같은 이미지를 두 환경에 쓴다. 로컬은 `vite.config.ts`의 `server.proxy`가 같은 역할을 한다. `/api`, `/swagger-ui`, `/v3/api-docs`로 시작하는 경로는 FE 라우트로 쓰지 않는다.
- 명세: https://dev.hapbang.duckdns.org/v3/api-docs (Swagger UI: `/swagger-ui/index.html`). 로컬 BE에만 `POST /api/v1/members/local-login?role=USER|INFLUENCER|VERIFIED_INFLUENCER|ADMIN` 테스트 로그인이 있다.
- 인증은 세션 쿠키(`SESSION`, HttpOnly)다. Spring CSRF가 켜져 있어 변경 요청은 `XSRF-TOKEN` 쿠키 값을 `X-XSRF-TOKEN` 헤더로 보내야 하고, 없으면 403이 난다.
- 응답 형식이 아직 통일되지 않았다: 대부분 `{ statusCode, message, data }`로 감싸지만 `/members/me`·`local-login`은 감싸지 않고, 403은 Spring 기본 에러 JSON, 401은 빈 본문이다. 공통 처리 전에 BE와 맞춘다. 목록은 Spring `Page` 형식(`content`, `page`)이다.

## 배포·환경변수

`docs/deploy.md`가 기준이다. `dev` → dev 서버, `main` → 운영으로 GitHub Actions가 이미지(GHCR)를 빌드해 EC2의 web 컨테이너만 교체한다. `nginx.conf`는 SPA fallback과 `/assets/` 장기 캐시를 담당한다.

`VITE_*` 값은 번들에 공개되므로 비밀값을 넣지 않고, 이미지에 환경별 값을 넣지 않는다(필요하면 `deploy.yml` build-arg를 팀과 상의).

## 코드 규칙

- import는 `@/`(= `src/`) 별칭을 쓴다. TS `strict`가 켜져 있다.
- Prettier: 세미콜론 없음, 작은따옴표. 마크다운과 `docs/mockup-ui.html`은 포맷 대상이 아니다.
- 문서·주석·커밋 메시지는 한국어. 커밋은 `Chore:`/`Docs:` 같은 접두어 + 요약, PR은 `dev`로 올린다.
