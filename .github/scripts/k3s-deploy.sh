#!/usr/bin/env bash
# large(k3s server)에서 root로 실행되는 FE 배포 스크립트. deploy.yml이 ssm-run.sh로 SSM Run Command에 실어 보낸다.
# BE 레포의 같은 이름 스크립트(앱별 배포)를 FE web 하나만 다루도록 줄였다.
# 공개 레포라 Actions 로그도 공개다. node 이름·IP가 나오는 출력(-o wide, describe)은 쓰지 않는다.
#
# 사용법:
#   k3s-deploy.sh image             지금 도는 web 이미지를 출력(없으면 빈 줄)
#   k3s-deploy.sh apply <sha>       <sha> 커밋의 k8s/overlays/prod에 이미지 :sha-<sha>를 넣어 적용하고 rollout을 기다린다
#                                   rollout이 실패하면 원인(이미지 pull·기동)을 알리고 rollout undo로 되돌린 뒤 실패로 끝난다
#   k3s-deploy.sh render <sha>      지금 작업 폴더의 k8s/overlays/prod로 apply와 같은 결과를 출력만 한다(CI 검사용)
# 로컬에서 prod에 직접 적용(SSM 준비 전): KUBECTL="kubectl --context hapbang-k3s" .github/scripts/k3s-deploy.sh apply <sha>  (docs/deploy.md)
# GHCR은 조직 정책으로 private이다. 이미지는 hapbang-prod의 공유 Secret ghcr-pull(BE 레포 k8s/registry)로 받는다(TKT-460).
#   BE 앱과 같은 Secret이다. 이 스크립트는 확인만 하고 만들거나 지우지 않는다. 토큰은 SSM 명령으로 넘기지 않는다.
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

# Secret이 있고 auths["ghcr.io"]에 인증 값이 든 dockerconfigjson인지만 본다. 값은 출력하지 않는다.
# 토큰이 유효한지는 실제 pull로만 알 수 있다(rollout).
# JSON은 python3로 읽는다(Ubuntu 24.04 기본 포함. jq는 서버에 없다).
check_pull_secret() {
  local type
  type=$(kc -n "$NS" get secret ghcr-pull -o jsonpath='{.type}' --ignore-not-found)
  if [ -z "$type" ]; then
    echo "::error::pull Secret ghcr-pull이 ${NS}에 없습니다. BE 레포의 k8s/registry를 먼저 적용하세요(BE docs/deploy/k8s.md GHCR pull 인증)."
    exit 1
  fi
  if [ "$type" != kubernetes.io/dockerconfigjson ] \
    || ! kc -n "$NS" get secret ghcr-pull -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d \
      | python3 -c 'import json, sys; a = json.load(sys.stdin).get("auths", {}).get("ghcr.io", {}); sys.exit(0 if a.get("auth") or (a.get("username") and a.get("password")) else 1)' 2> /dev/null; then
    echo "::error::pull Secret ghcr-pull의 형식이 다릅니다(type $type). ghcr.io 인증이 든 kubernetes.io/dockerconfigjson이어야 합니다."
    exit 1
  fi
}

# rollout이 실패한 원인을 나눈다. 이미지 pull 실패는 코드와 무관하므로 먼저 가린다.
# 이벤트는 지금 pull에 실패한 pod 것만 본다. 이전 배포의 pod 이벤트(보존 1시간)가 섞이면 원인을 잘못 고른다.
explain_failure() {
  local failing messages
  failing=$(kc -n "$NS" get pods -l app.kubernetes.io/name=web \
    -o jsonpath='{range .items[*]}{.metadata.name}{" "}{range .status.containerStatuses[*]}{.state.waiting.reason}{end}{"\n"}{end}' \
    | awk '$2 == "ErrImagePull" || $2 == "ImagePullBackOff" { print $1 }')
  messages=$(kc -n "$NS" get events --field-selector type=Warning,reason=Failed \
    -o jsonpath='{range .items[*]}{.involvedObject.name}{" "}{.message}{"\n"}{end}' \
    | awk -v pods="$failing" 'BEGIN { n = split(pods, p, "\n"); for (i = 1; i <= n; i++) want[p[i]] = 1 } $1 in want')
  if [ -z "$failing" ]; then
    echo "::error::web: 이미지는 받았고 pod가 Ready가 되지 않았습니다(기동·probe 실패). 위 pod 상태와 이벤트를 확인하세요."
  elif grep -qiE ': not found|manifest unknown' <<< "$messages"; then
    echo "::error::web: 이미지가 GHCR에 없습니다. 그 커밋의 Publish image run을 확인하세요."
  # 숫자(401·403)로 찾지 않는다. 메시지의 이미지 이름(:sha-<16진수 40자>)에 같은 숫자가 들어갈 수 있다.
  # containerd는 "401 Unauthorized"·"403 Forbidden"으로 적는다.
  elif grep -qiE 'unauthorized|forbidden|denied' <<< "$messages"; then
    echo "::error::web: GHCR 인증에 실패했습니다(401·403). ghcr-pull 토큰의 만료·권한을 확인하세요(BE docs/deploy/k8s.md GHCR pull 인증)."
  else
    echo "::error::web: 이미지를 받지 못했습니다(원인 미분류). 위 이벤트를 확인하세요."
  fi
}

image() {
  kc -n "$NS" get deploy web -o jsonpath='{.spec.template.spec.containers[0].image}' --ignore-not-found
  echo
}

apply_web() {
  local sha=${1:-}
  check_sha "$sha"

  # trap이 스크립트 종료 때 지울 수 있게 전역 변수로 둔다.
  dir=$(mktemp -d)
  trap 'rm -rf "$dir"' EXIT

  # 공개 레포에서 배포할 커밋의 manifest를 받는다. 서버에 레포를 두지 않는다.
  curl -sSfL "https://codeload.github.com/$REPO/tar.gz/$sha" | tar xz -C "$dir" --strip-components=1

  mkdir "$dir/deploy"
  write_wrapper ../k8s/overlays/prod "$sha" "$dir/deploy"

  check_pull_secret
  kc apply -k "$dir/deploy"

  if kc -n "$NS" rollout status deploy/web --timeout="$ROLLOUT_TIMEOUT"; then
    return
  fi

  echo "rollout 실패: web. 이전 revision으로 되돌린다."
  kc -n "$NS" get pods -l app.kubernetes.io/name=web || true
  kc -n "$NS" get events --field-selector type=Warning --sort-by=.lastTimestamp \
    -o 'custom-columns=AGE:.lastTimestamp,REASON:.reason,OBJECT:.involvedObject.name,MESSAGE:.message' \
    | grep web | tail -n 10 || true
  explain_failure || true
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
