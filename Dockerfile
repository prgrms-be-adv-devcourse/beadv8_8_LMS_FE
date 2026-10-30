# React 정적 파일 이미지. Caddy가 8080에서 dist/만 서빙한다(non-root, uid 10001).
# 진입점은 k3s의 Envoy Gateway다. /는 이 이미지(Service web:80 → 8080), /api는 BE 앱으로 간다(k8s/base).
# API는 상대 경로(/api/v1/...)로 호출해야 같은 도메인이라 CORS 없이 동작한다.

FROM node:24-alpine AS build
WORKDIR /app
# package.json의 packageManager 버전으로 pnpm을 쓴다.
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# 토스페이먼츠 테스트 클라이언트 키(공개 값). 비어 있으면 HP 충전이 꺼진 채로 빌드된다(docs/deploy.md).
ARG VITE_TOSS_PAYMENTS_CLIENT_KEY=
ENV VITE_TOSS_PAYMENTS_CLIENT_KEY=$VITE_TOSS_PAYMENTS_CLIENT_KEY
# 'true'면 로그인 모달에 테스트 계정 로그인을 넣는다. 로컬 k3d에서 로컬 BE와 함께 볼 때만 직접 넘긴다.
# 발행 workflow(publish.yml)는 넘기지 않는다(운영에는 local-login API가 없다).
ARG VITE_LOCAL_LOGIN=
ENV VITE_LOCAL_LOGIN=$VITE_LOCAL_LOGIN
RUN pnpm build

FROM caddy:2.11.7-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
# 공식 이미지는 80 바인딩용 file capability(cap_net_bind_service)를 caddy에 붙여 둔다.
# k8s에서 capabilities를 모두 뺀 non-root로 실행하면 exec가 거부되므로 지운다(8080만 쓴다).
RUN setcap -r /usr/bin/caddy
# admin·자동 HTTPS·설정 저장을 껐지만 Caddy가 쓰는 디렉터리를 /tmp로 둔다(읽기 전용 루트 파일 시스템).
ENV XDG_CONFIG_HOME=/tmp XDG_DATA_HOME=/tmp
USER 10001
EXPOSE 8080
