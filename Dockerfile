# React 정적 파일 이미지. 80 포트에서 dist/만 서빙한다.
# /api 프록시·도메인·환경 구분은 서버의 edge nginx가 맡는다(BE 레포 docker/).
# API는 상대 경로(/api/v1/...)로 호출해야 같은 이미지를 개발·운영에 그대로 쓸 수 있다.

FROM node:24-alpine AS build
WORKDIR /app
# package.json의 packageManager 버전으로 pnpm을 쓴다.
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
