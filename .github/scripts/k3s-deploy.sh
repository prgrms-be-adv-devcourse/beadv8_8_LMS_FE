#!/usr/bin/env bash
# large(k3s server)에서 root로 실행되는 FE 배포 스크립트. deploy.yml이 ssm-run.sh로 SSM Run Command에 실어 보낸다.
# BE 레포의 같은 이름 스크립트(앱별 배포)를 FE web 하나만 다루도록 줄였다.
# 공개 레포라 Actions 로그도 공개다. node 이름·IP가 나오는 출력(-o wide, describe)은 쓰지 않는다.
#
# 사용법:
#   k3s-deploy.sh image             지금 도는 web 이미지를 출력(없으면 빈 줄)
#   k3s-deploy.sh apply <sha>       <sha> 커밋의 k8s/overlays/prod에 이미지 :sha-<sha>를 넣어 적용하고 rollout을 기다린다
#                                   rollout이 실패하면 rollout undo로 되돌리고 실패로 끝난다
#                                   GHCR이 private이라 환경 변수 GHCR_USER·GHCR_TOKEN(read:packages)이 필요하다.
#                                   그 값으로 pull Secret(ghcr-pull)을 만들고, rollout이 끝나면(성공·실패 모두) 지운다.
#                                   이미지는 노드에 남으므로 pod가 같은 노드에서 다시 떠도 받지 않는다.
#   k3s-deploy.sh render <sha>      지금 작업 폴더의 k8s/overlays/prod로 apply와 같은 결과를 출력만 한다(CI 검사용)
# 로컬에서 prod에 직접 적용(첫 배포·SSM 준비 전):
#   GHCR_USER=<GitHub 아이디> GHCR_TOKEN=<read:packages만 있는 1일 PAT> KUBECTL="kubectl --context hapbang-k3s" .github/scripts/k3s-deploy.sh apply <sha>  (docs/deploy.md)
set -euo pipefail

# SSM은 HOME 없이 실행한다. kubectl이 캐시 디렉터리를 만들 수 있게 둔다.
export HOME=${HOME:-/root}
REPO=prgrms-be-adv-devcourse/beadv8_8_LMS_FE
IMAGE=ghcr.io/prgrms-be-adv-devcourse/beadv8_8_lms_fe
NS=hapbang-prod
KUBECTL=${KUBECTL:-k3s kubectl}
ROLLOUT_TIMEOUT=${ROLLOUT_TIMEOUT:-3m}

# KUBECTL은 "k3s kubectl"처럼 단어 여러 개라 따옴표 없이 펼친다.
# shellcheck disable=SC2086
kc() { $KUBECTL "$@"; }

# prod overlay를 감싸 이미지 web을 GHCR :sha-<sha>로 바꾸는 kustomization을 <폴더>에 쓴다. 레포의 overlay 파일은 고치지 않는다.
write_wrapper() {
  local overlay=$1 sha=$2 out=$3
  cat > "$out/kustomization.yaml" <<YAML
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - $overlay
images:
  - name: web
    newName: $IMAGE
    newTag: sha-$sha
YAML
}

check_sha() {
  if ! [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "잘못된 입력: sha=${1:-}" >&2
    exit 2
  fi
}

# 토큰은 명령 인자로 넘기지 않는다(프로세스 목록에 보인다). manifest를 stdin으로 적용한다.
create_pull_secret() {
  local auth config
  auth=$(printf '%s:%s' "$GHCR_USER" "$GHCR_TOKEN" | base64 | tr -d '\n')
  config=$(printf '{"auths":{"ghcr.io":{"auth":"%s"}}}' "$auth" | base64 | tr -d '\n')
  kc apply -f - > /dev/null <<YAML
apiVersion: v1
kind: Secret
metadata:
  name: ghcr-pull
  namespace: $NS
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: $config
YAML
}

delete_pull_secret() {
  kc -n "$NS" delete secret ghcr-pull --ignore-not-found > /dev/null || true
}

image() {
  kc -n "$NS" get deploy web -o jsonpath='{.spec.template.spec.containers[0].image}' --ignore-not-found
  echo
}

apply_web() {
  local sha=${1:-}
  check_sha "$sha"
  if [ -z "${GHCR_USER:-}" ] || [ -z "${GHCR_TOKEN:-}" ]; then
    echo "GHCR_USER·GHCR_TOKEN이 필요하다(GHCR이 private)." >&2
    exit 2
  fi

  # trap이 스크립트 종료 때 지울 수 있게 전역 변수로 둔다. 실패·중단돼도 pull Secret을 남기지 않는다.
  dir=$(mktemp -d)
  trap 'rm -rf "$dir"; delete_pull_secret' EXIT

  # 공개 레포에서 배포할 커밋의 manifest를 받는다. 서버에 레포를 두지 않는다.
  curl -sSfL "https://codeload.github.com/$REPO/tar.gz/$sha" | tar xz -C "$dir" --strip-components=1

  mkdir "$dir/deploy"
  write_wrapper ../k8s/overlays/prod "$sha" "$dir/deploy"

  create_pull_secret
  kc apply -k "$dir/deploy"

  if kc -n "$NS" rollout status deploy/web --timeout="$ROLLOUT_TIMEOUT"; then
    return
  fi

  echo "rollout 실패: web. 이전 revision으로 되돌린다."
  kc -n "$NS" get pods -l app.kubernetes.io/name=web || true
  kc -n "$NS" get events --field-selector type=Warning --sort-by=.lastTimestamp \
    -o 'custom-columns=AGE:.lastTimestamp,REASON:.reason,OBJECT:.involvedObject.name,MESSAGE:.message' \
    | grep web | tail -n 10 || true
  # Service·HTTPRoute·NetworkPolicy는 되돌리지 않는다. Deployment만 이전 revision으로 돌린다.
  # 첫 배포처럼 이전 revision이 없으면 그대로 두고 실패로 끝낸다(복구 절차: docs/deploy.md).
  if kc -n "$NS" rollout undo deploy/web; then
    kc -n "$NS" rollout status deploy/web --timeout=2m || true
  else
    echo "이전 revision이 없어 되돌리지 못했다(첫 배포)."
  fi
  exit 1
}

render() {
  local sha=${1:-}
  check_sha "$sha"
  # kustomize는 절대 경로 resource를 받지 않으므로 apply와 같은 상대 경로가 되게 레포 안에 임시 폴더를 둔다.
  dir=$(mktemp -d "$PWD/.k3s-render.XXXXXX")
  trap 'rm -rf "$dir"' EXIT
  write_wrapper ../k8s/overlays/prod "$sha" "$dir"
  kc kustomize "$dir"
}

case "${1:-}" in
  image) image ;;
  apply) shift; apply_web "$@" ;;
  render) shift; render "$@" ;;
  *) echo "사용법: $0 image | apply <sha> | render <sha>" >&2; exit 2 ;;
esac
