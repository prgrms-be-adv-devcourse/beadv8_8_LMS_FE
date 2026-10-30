# 배포

서버·클러스터 구성과 운영 문서는 BE 레포 [docs/deploy](https://github.com/prgrms-be-adv-devcourse/beadv8_8_LMS_BE/blob/dev/docs/deploy/README.md)에 있다. 여기서는 FE 개발자가 알아야 할 것만 정리한다.

| 환경 | 주소 | 브랜치 |
| --- | --- | --- |
| prod | https://hapbang.duckdns.org | `main` |

dev 서버는 없다(2026-10-30 Compose와 함께 제거, BE #440). 화면 확인은 `pnpm dev` + 로컬 BE, 이미지·manifest 확인은 로컬 k3d로 한다.

## 구성

```
[인터넷] :443 ─ Envoy Gateway(k3s, BE 레포 k8s/gateway) ─┬─ /api/v1/<모듈>/...   → BE 앱
                                                       ├─ /api·/actuator·/swagger-ui·/v3/api-docs 그 외 → 404
                                                       ├─ /grafana/, /kafka/  → 관리 화면
                                                       └─ /                   → web:80 (이 레포, HTTPRoute web)
```

- FE는 `hapbang-prod` namespace의 `web` Deployment·Service·HTTPRoute·NetworkPolicy만 가진다(`k8s/base`). Gateway·TLS·namespace는 BE 레포가 관리한다.
- 컨테이너는 Caddy(`Caddyfile`)가 non-root 8080에서 `dist/`만 서빙한다. Service는 `web:80` → 8080이다.
- pod는 medium(`hapbang.io/pool=app-observe`)에 replica 1개, 메모리 64Mi다. 배포 때 기존 pod를 먼저 내리므로(`maxSurge: 0`) 수 초 끊긴다.

## 배포 흐름

```
PR → dev 병합            CI만 (format:check · lint · test · build · manifest 검사)
dev → main 병합          Publish image: CI → 이미지 GHCR push  :sha-<커밋>
운영 반영(수동)           Actions → Deploy → Run workflow(main), sha 입력(비우면 main 최신)
  커밋이 main에 있는지·이미지가 있는지 확인
  → GitHub OIDC → IAM role → SSM으로 large에서 .github/scripts/k3s-deploy.sh apply <sha>
  → 그 커밋의 k8s/overlays/prod에 :sha-<커밋>을 넣어 apply → rollout status
```

- main 병합만으로는 운영이 바뀌지 않는다. 운영에 올리는 시점은 사람이 정해 Deploy를 실행한다.
- **자동 롤백**: rollout이 3분 안에 끝나지 않으면 `web` Deployment만 이전 revision으로 되돌리고 실패로 표시한다. Service·HTTPRoute·NetworkPolicy는 되돌리지 않는다.
- **수동 롤백**: 되돌릴 main 커밋 sha를 넣고 Deploy를 실행한다.
- 이미지 태그는 `:sha-<커밋>` 하나다. `:latest`·`:dev`는 만들지 않는다.

### 이미지 pull (GHCR private)

GHCR 패키지는 조직 정책으로 private이다(public 전환 불가). 클러스터에 장기 토큰을 두지 않는다.

- 배포 스크립트가 `GHCR_USER`·`GHCR_TOKEN`으로 `hapbang-prod`에 `ghcr-pull` Secret을 만들고, rollout이 끝나면(성공·실패·중단 모두) 지운다. prod overlay의 Deployment는 `imagePullSecrets: ghcr-pull`을 가진다.
- Deploy workflow는 그 job의 `GITHUB_TOKEN`(packages: read, job이 끝나면 만료)을 넘긴다. 토큰은 명령 인자가 아니라 스크립트 앞의 `export`로 보내며, SSM 명령 기록에는 남는다.
- 배포 뒤에는 Secret이 없지만, 노드에 이미지가 남아 있으므로 pod가 다시 떠도(노드 재시작 포함) 다시 받지 않는다(`IfNotPresent`).
- **주의**: 노드 디스크가 차서 이미지가 정리됐거나 pod가 이미지 없는 노드로 옮겨지면 `ImagePullBackOff`가 난다. 같은 sha로 다시 배포하면 복구된다.

### 사전 준비 (한 번)

| 항목 | 내용 |
| --- | --- |
| GHCR 패키지 | `beadv8_8_lms_fe`는 private(조직 정책). 이 레포 Actions에 읽기 권한이 있어야 한다(publish.yml이 처음 만들 때 자동 연결) |
| GitHub Environment `prod` | 배포 브랜치를 `main`으로 제한. Secrets `AWS_DEPLOY_ROLE_ARN`, `DEPLOY_INSTANCE_ID` |
| IAM role trust | GitHub OIDC의 이 레포 `environment:prod` subject를 허용한다(BE [k8s.md 운영 앱 배포](https://github.com/prgrms-be-adv-devcourse/beadv8_8_LMS_BE/blob/dev/docs/deploy/k8s.md) 참고). BE 레포의 자격 증명을 복사하지 않는다 |

### SSM 준비 전 직접 배포

prod kubeconfig(context `hapbang-k3s`, 6443이 내 IP로 열려 있어야 함)가 있으면 같은 스크립트를 로컬에서 실행할 수 있다. 이미지(`:sha-<커밋>`)가 GHCR에 있어야 하고, pull용 토큰에 `read:packages`가 있어야 한다. 토큰은 배포 동안만 클러스터에 있고 끝나면 지워진다.

```sh
gh auth refresh -s read:packages     # 한 번. gh 토큰에 read:packages를 더한다
GHCR_USER=<GitHub 아이디> GHCR_TOKEN=$(gh auth token) \
  KUBECTL="kubectl --context hapbang-k3s" .github/scripts/k3s-deploy.sh apply <40자 main 커밋 sha>
```

`kubectl` 기본 context가 prod일 수 있으니 항상 `--context`를 적는다.

### 배포 확인

```sh
kubectl --context hapbang-k3s -n hapbang-prod get deploy,pod,svc,endpointslices -l app.kubernetes.io/name=web
kubectl --context hapbang-k3s -n hapbang-prod get httproute web -o jsonpath='{.status.parents[0].conditions}'  # Accepted·ResolvedRefs True
curl -sI https://hapbang.duckdns.org/                 # 200, Cache-Control: no-cache
curl -sI https://hapbang.duckdns.org/lectures/1       # 200 (딥링크)
curl -sI https://hapbang.duckdns.org/api/v1/nope      # 404 (FE로 오지 않음)
```

BE 앱이 배포되지 않았으면 화면은 열리지만 API가 404라 로그인·목록이 동작하지 않는다. FE 배포 성공과 BE 연동 성공은 따로 확인한다.

### 첫 배포가 실패했을 때

이전 revision이 없어 자동 롤백이 되지 않는다. 원인을 고친 커밋으로 다시 배포하거나, `/`를 다시 404로 돌리려면 FE 리소스를 지운다. 공용 Gateway·BE 리소스는 건드리지 않는다.

```sh
kubectl --context hapbang-k3s -n hapbang-prod get events --field-selector type=Warning --sort-by=.lastTimestamp | grep web
kubectl --context hapbang-k3s -n hapbang-prod delete httproute/web deploy/web svc/web networkpolicy/web
```

## 로컬 k3d 확인

BE 레포의 로컬 클러스터(`k8s/local/k3d.yaml`, context `k3d-hapbang`, Gateway 설치: `k8s/gateway/tools/install-local.sh`)를 쓴다.

```sh
docker build -t hapbang/web:local .            # 로컬 BE 테스트 로그인을 켜려면 --build-arg VITE_LOCAL_LOGIN=true
k3d image import hapbang/web:local -c hapbang
kubectl --context k3d-hapbang apply -k k8s/overlays/local
kubectl --context k3d-hapbang -n hapbang-prod rollout status deploy/web

# Gateway 경유 확인 (local listener hostname: hapbang.local)
SVC=$(kubectl --context k3d-hapbang -n envoy-gateway-system get svc -l gateway.envoyproxy.io/owning-gateway-name=hapbang -o jsonpath='{.items[0].metadata.name}')
kubectl --context k3d-hapbang -n envoy-gateway-system port-forward svc/$SVC 18443:443 &
curl -skI --resolve hapbang.local:18443:127.0.0.1 https://hapbang.local:18443/lectures/1
```

기대: `/`·딥링크 200 `no-cache`, `/assets/<해시>.js` 200 `immutable`, 없는 `/assets/*`·`/api/*`·`/swagger-ui/` 404.

## 코드 작성 규칙

**API는 상대 경로로 호출한다.**

```ts
fetch('/api/v1/lectures')                        // ✅
fetch('https://hapbang.duckdns.org/api/...')     // ❌ 같은 출처가 아니면 CORS·쿠키 문제가 생긴다
```

같은 출처(origin)라 CORS 설정이 필요 없고, 세션 쿠키도 그대로 전송된다. 로컬 개발에서는 `vite.config.ts`의 `server.proxy`로 `/api`를 로컬 BE(`http://localhost:8080`)에 연결한다.

**라우팅**: Caddy가 없는 경로를 `index.html`로 돌려주므로(SPA fallback) 클라이언트 라우터를 그대로 쓰면 된다. `/api`, `/actuator`, `/swagger-ui`, `/v3/api-docs`, `/grafana`, `/kafka`로 시작하는 경로는 Gateway가 FE로 보내지 않으므로 FE 라우트로 쓰지 않는다.

## 환경변수

Vite의 `VITE_*` 변수는 **빌드할 때 JS 번들에 그대로 박혀 누구나 볼 수 있다.** 

- 비밀값(API 키, 토큰 등)을 넣지 않는다. 비밀이 필요한 기능은 BE를 통한다.
- `.env`, `.env.*`는 커밋하지 않는다.
- 새 빌드 인자가 필요하면 `publish.yml` build-args를 바꿔야 하므로 팀과 먼저 상의한다.

| 변수 | 값 | 넣는 곳 |
| --- | --- | --- |
| `VITE_TOSS_PAYMENTS_CLIENT_KEY` | 토스페이먼츠 테스트 클라이언트 키(`test_ck_…`, 공개 값). 비어 있으면 HP 충전 버튼이 꺼진다 | 로컬은 `.env.local`, 배포는 GitHub Variable `TOSS_PAYMENTS_CLIENT_KEY` → `publish.yml` build-args → `Dockerfile` `ARG` |
| `VITE_LOCAL_LOGIN` | `true`면 로그인 모달에 테스트 계정 로그인 버튼(`POST /members/local-login`)을 보여 준다. `pnpm dev`에서는 값 없이도 보인다 | 로컬 k3d 이미지를 직접 빌드할 때만 `--build-arg`로 넘긴다. 발행 이미지에는 넣지 않는다(운영에는 API가 없다) |

## 파일

| 파일 | 역할 |
| --- | --- |
| `Dockerfile` | node로 빌드 → Caddy에서 `dist/` 서빙(non-root 8080) |
| `Caddyfile` | SPA fallback, `/assets/` 장기 캐시(없는 파일은 404), `index.html` 캐시 안 함, `/health` |
| `k8s/base` | `web` Deployment·Service(80→8080)·HTTPRoute(`/`)·NetworkPolicy(Envoy에서만 8080) |
| `k8s/overlays/prod`, `k8s/overlays/local` | 운영(GHCR 이미지), 로컬 k3d(`hapbang/web:local`) |
| `.github/workflows/ci.yml` | PR마다 format:check·lint·test·build, manifest schema 검사 |
| `.github/workflows/publish.yml` | `main` push 때 이미지 발행(`:sha-<커밋>`) |
| `.github/workflows/deploy.yml` | 운영 배포·롤백(수동, OIDC → SSM) |
| `.github/scripts/k3s-deploy.sh` | large에서 실행하는 적용·rollout·자동 롤백 스크립트 |
| `.github/scripts/ssm-run.sh` | 스크립트를 SSM Run Command로 large에 보내 실행(BE 레포와 같은 파일) |
