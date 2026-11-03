# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

합방(hapbang): 인플루언서 강의 판매와 방송 출연(합방) 거래를 HP(1 HP = 1원)로 처리하는 서비스의 FE. React 19 + TypeScript + Vite 8 SPA이고, BE는 별도 레포(`beadv8_8_LMS_BE`, Spring)다.

## 명령

pnpm만 쓴다(`packageManager`로 버전 고정, Node 24는 `.node-version`). npm/yarn lockfile을 만들지 않는다.

```sh
pnpm dev            # /api → 로컬 Envoy(기본 http://localhost:8000, API_PROXY_TARGET) 프록시
pnpm build          # tsc -b(타입 체크) 후 vite build
pnpm lint           # oxlint
pnpm test           # Vitest + Testing Library + MSW
pnpm format:check   # Prettier 검사
pnpm format         # Prettier 적용 / format:check는 검사만
```

CI(`.github/workflows/ci.yml`)는 `format:check → lint → test → build` 순서로 돌고 `k8s/` manifest를 schema로 검사한다. 모두 통과한 dev 커밋만 이미지가 발행되고 운영에 배포된다. 앱 흐름 테스트는 `src/app/*.test.tsx`, 테스트 공통 설정은 `src/test/`에 둔다.
Radix 탭은 `mousedown`에서 선택되므로 테스트는 `fireEvent.click`이 아니라 `userEvent`를 쓴다. 이미 선택된 탭을 다시 눌러도 `onChange`가 불리지 않는다. 패널은 목록보다 먼저 그려지므로 `within(panel).findBy…`로 기다린다.

## 화면 명세: `docs/mockup-ui.html`

확정된 UI 목업이다. 브라우저로 열면 역할별(유저 U-xx, 인플루언서 I-xx, 관리자 A-xx) 프레임을 넘겨 볼 수 있고, 프레임마다 라우트·API 안·적용 정책이 붙어 있다. 파일이 커서(약 330KB) 섹션 단위로 찾아 읽는다.

- `<style>`(6–642행): 디자인 토큰(`:root` CSS 변수, 다크 모드 포함)과 컴포넌트 클래스(`.btn.primary`, `.pill.ok`, `.panel` …). 앱 CSS는 이것을 그대로 옮긴다(Tailwind·UI 키트로 재작성하지 않는다). 534행 이후 `--fx-*`/에디터 셸은 목업 뷰어용이라 옮기지 않는다.
- 스크립트의 `/* ───── … ───── */` 주석이 섹션 경계다: 샘플 데이터, `ROLES`/`NAV`(역할별 메뉴·접근 권한), 공용 컴포넌트(`Pill`, `Head`, `Field`, `Tabs`, `Modal`, `Empty`), 화면별 컴포넌트, 프레임 정의(`route:`, API 안).
- 모바일 대응은 `@media`가 아니라 `@container app`이다.
- 역할: 비회원 / 유저 / 인플루언서 / 인증된 인플루언서 / 관리자. HP 종류는 색으로 고정한다(충전=`--charge` 파랑, 수익=`--earn` 초록, 보류=`--hold` 호박색).
- 목업의 `ctx` 전역 상태(지갑, 장부, 장바구니, 출연 등)와 `hold`/`unhold` 같은 잔액 계산은 프로토타입용이다. 실제로는 서버 데이터이므로 TanStack Query로 다루고 계산은 BE가 한다. 라우트·검색어·필터는 URL에 둔다.

라이브러리는 직접 구현보다 성숙한 것을 선호한다(팀 방침). 스타일은 목업 CSS(토큰 + CSS Modules), 서버 상태는 TanStack Query로 정했다.
탭은 `@/shared/ui/Tabs`(Radix Tabs, 수동 활성화: 화살표는 포커스만, Enter·Space·클릭으로 선택)를 쓴다. 관리자 상태 필터는 탭이 아니라 `aria-pressed` 버튼이다.

## BE 연동

- **API는 상대 경로(`/api/v1/...`)로만 호출한다.** 운영은 k3s의 Envoy Gateway가 같은 출처에서 `/`는 FE, `/api`는 BE 앱으로 보낸다. 로컬은 `vite.config.ts`의 `server.proxy`가 `/api`(채팅 웹소켓 포함)를 로컬 Envoy(BE docker compose)로 넘긴다. `/api`, `/swagger-ui`, `/v3/api-docs`로 시작하는 경로는 FE 라우트로 쓰지 않는다.
- 명세: dev 서버는 없다(2026-10-30 제거). 로컬 BE 각 앱의 `http://localhost:<앱 포트>/v3/api-docs`(Swagger UI: `/swagger-ui/index.html`)나 BE 레포 코드로 본다. BE는 역할별 초기 계정(인플루언서·인증된 인플루언서·관리자, `*@hapbang.local`, 비밀번호 `hapbang1234!`, BE `MemberSeedAccountUseCase`)을 만든다. 로그인 모달의 테스트 계정 버튼은 이 계정으로 이메일·비밀번호 로그인(`POST /members/login`)을 하고, `pnpm dev`와 `VITE_LOCAL_LOGIN=true`로 직접 빌드한 이미지에서만 보인다.
- 인증은 JWT다. access token(15분)은 `shared/auth/token.ts` 메모리에만 두고 `Authorization: Bearer`로 보낸다(storage에 두지 않는다). refresh token(14일)은 BE가 `HttpOnly` 쿠키(`Path=/api/v1/members/auth`)로만 다루고 FE는 읽지 않는다. CSRF는 없다.
  - 앱 시작(`rootLoader`)·구글 로그인 복귀·테스트 계정 로그인 뒤에 `POST /members/auth/refresh`로 access token을 받는다(탭 안에서는 한 번만 실행). `api()`·업로드는 401·403이면 refresh 후 한 번만 다시 보낸다. 로그아웃은 `POST /members/auth/logout` 뒤 토큰을 버리고 다른 탭에 알린다.
  - 채팅 웹소켓은 일회용 티켓으로 인증한다. 연결·재연결마다 `POST /chats/ws-tickets`로 티켓을 받아 `/api/v1/chats/ws?ticket=`에 싣고(CONNECT에는 토큰을 넣지 않는다), 연결 만료 60초 전에 새 티켓을 `SEND /pub/chats/reauth`(헤더 `ticket`)로 보내 같은 연결을 재인증한다. 결과는 `/user/queue/chats/connection`(`features/chat/connectionAuth.ts`, `ChatConnection`). 계약은 BE `apps/chat-app/docs/contracts/resync-frame.md`.
  - Envoy가 Bearer를 검증해 앱에 `X-User-Id`·`X-User-Role`로 넘긴다(운영·로컬 같음). 로컬은 BE 레포 `docker/compose.yaml`의 envoy 서비스(`localhost:8000`, `ENVOY_PORT`로 바꿈, BE `docs/dev/local.md`)를 띄우고 개발 서버가 그쪽으로 proxy한다. 주소는 `API_PROXY_TARGET`(기본 `http://localhost:8000`, `.env.local`).
  - 테스트: `renderApp`은 회원이면 토큰을 미리 넣고, MSW 기본 응답은 refresh 401·logout 204다.
- 응답은 `{ statusCode, message, data }`로 감싼다(`/members/me`·`/members/login` 포함). 다만 403은 Spring 기본 에러 JSON, 401은 빈 본문이다. 공통 처리 전에 BE와 맞춘다. 목록은 Spring `Page` 형식(`content`, `page`)이다.
- 개발 서버는 `/api` 요청을 모두 로컬 BE로 보낸다(개발용 목 없음). MSW는 테스트(`msw/node`, `src/test/server.ts`)에서만 쓰고, 화면별 BE 흉내는 `src/test/` 아래에 둔다(예: 관리자 채널 심사 `src/test/channelReviewMock.ts`).

## 강의 구매자 기능

- 강의 목록·상세, 장바구니·주문, 내 강의·시청, 구매 확정·취소, 리뷰 화면이 실제 BE API에 연결되어 있다.
- 주문 상태가 필요한 앱 흐름 테스트는 그 테스트 안에서 `mockOrders(order)`(`src/test/lectureOrders.ts`)로 구매 목록·주문 상세·구매 확정·취소·재생 동의 응답을 켠다.
- 구매 목록과 내 리뷰는 첫 페이지로만 보유·작성 여부를 판단하지 않는다. 자료 다운로드는 클릭 시 시청 URL을 다시 발급받는다.

## 모집용 단체방

- 출연 모집글의 호스트가 만드는 단체방(`roomType: GROUP`)이다. 기준은 BE `apps/chat-app/docs/final-design.md` 3장이다. 새 라우트 없이 `/chat/:chatRoomId`에서 열고, 모집 상세에 '단체방' 패널(`features/chat-group/RecruitGroupPanel`)이 있다. 참여자·초대·폐쇄 확인은 채팅 화면 머리의 모달(`features/chat-group/GroupModals`)이다.
- 방 목록·상세는 참여자를 싣지 않는다(`members: []`). 내 참여 세대는 `group.myParticipationVersion`이고, 방 종류와 관계없이 `myMembershipIn`(`entities/chat/api.ts`)으로 읽는다. 참여자는 `GET /chats/{id}/members` 페이지로 읽는다.
- 할 수 있는 일은 상태로 정한다(`groupPermissions`, `entities/chat/group.ts`). 사용 중일 때만 보내기·초대·내보내기가 된다. 호스트는 나가기 대신 폐쇄하고, 직접 폐쇄한 방에서만 나갈 수 있다.
- 일반 메시지의 보낸 사람 이름은 서버의 `sender.nickname`으로 보인다(나간 회원도 남고, 정보가 없으면 '알 수 없는 회원'). 단체방 안내는 서버가 종류와 회원 ID만 준다(`content`는 빈 문자열, `sender: null`). 문구는 `entities/chat/notification.ts` 템플릿이 만들고, 이름은 불러온 메시지의 보낸 사람 정보와 참여자 목록에서 찾는다. 못 찾으면 '알 수 없는 회원'이다. 사용자 화면에는 회원 ID를 보이지 않는다(닉네임은 겹치지 않는다). 관리자 화면은 분쟁 확인용으로 회원 ID를 보인다.
- 테스트의 BE 흉내는 `src/test/chatGroupMock.ts`(`mockGroup`)다.
- 메시지별 안 읽은 사람 수(1:1·단체방 모두, BE `contracts/unread-count.md`): 일반 메시지의 `unreadMemberCount`와 방 topic의 `READ_COUNTS` 프레임(재동기화 신호가 아니다)을 `features/chat/readCounts.ts`에 모은다. 같은 메시지는 작은 값을 남기고(값은 줄기만 한다), 참여 세대가 바뀌어 이력 캐시를 버리면 함께 버린다. 0이거나 값이 없으면 숨긴다.

## 배포·환경변수

`docs/deploy.md`가 기준이다. 운영(prod) 한 환경만 있고 **dev 병합이 곧 운영 배포**다(기본 브랜치 dev, #156). main은 서버 없는 안정화 표시다. `dev` push → `publish.yml`이 이미지(GHCR `:sha-<커밋>`)를 발행하고, Publish image가 성공하면 `deploy.yml`이 그 커밋을 자동 배포해 k3s의 `web` Deployment만 바꾼다(롤백은 수동 실행). manifest는 `k8s/`(base·overlays), 정적 서버는 Caddy(`Caddyfile`: SPA fallback, `/assets/` 장기 캐시)다.

`VITE_*` 값은 번들에 공개되므로 비밀값을 넣지 않고, 이미지에 환경별 값을 넣지 않는다(필요하면 `publish.yml` build-arg를 팀과 상의).

## 코드 규칙

- import는 `@/`(= `src/`) 별칭을 쓴다. TS `strict`가 켜져 있다.
- Prettier: 세미콜론 없음, 작은따옴표. 마크다운과 `docs/mockup-ui.html`은 포맷 대상이 아니다.
- 문서·주석·커밋 메시지는 한국어. 커밋은 `Chore:`/`Docs:` 같은 접두어 + 요약, PR은 `dev`로 올리고 squash로 병합한다(dev 커밋 하나 = PR 하나). dev → main은 merge commit이다.
