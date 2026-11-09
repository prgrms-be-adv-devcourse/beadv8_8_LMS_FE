# BE API 명세 보기

FE가 기준으로 삼는 BE 명세를 어디서 보는지와, 명세로 FE의 빈 곳을 찾는 방법을 적는다. dev 서버는 없다(2026-10-30 제거).

## 어디서 보나

1. **로컬 BE**: 앱 포트별 `http://localhost:<앱 포트>/v3/api-docs`(UI `/swagger-ui/index.html`). 실행은 BE `docs/dev/local.md`.
2. **운영 Swagger**: 로컬 BE가 꺼져 있을 때 쓴다. 명세 문서는 토큰 없이 열린다.
   - 명세 JSON: `https://hapbang.duckdns.org/api/v1/<모듈>/v3/api-docs`
   - UI: `https://hapbang.duckdns.org/api/v1/<모듈>/swagger-ui.html`
   - 운영 Swagger의 Authorize 버튼은 access token(`bearerAuth`)을 받는다. 운영 데이터가 바뀌는 요청은 보내지 않는다.
3. **BE 코드**: `git -C ../beadv8_8_LMS_BE fetch origin` 뒤 `git show origin/dev:<경로>`. 운영은 dev 병합 뒤 자동 배포라 보통 dev와 같지만, 막 병합된 변경은 배포가 끝나야 운영 명세에 나온다.

### 운영 모듈 이름

| 모듈 | 내용 |
| --- | --- |
| `members` | 회원·인증·채널·승급 |
| `wallets` | 지갑·충전·환불과 정산(`/settlements/**`) |
| `appearances` | 출연 요청서·모집·출연·리뷰 |
| `lectures` | 강의·장바구니·주문·리뷰와 쿠폰(`/coupons/**`) |
| `chats` | 채팅·단체방 |
| `inquiries` | 고객센터 문의 |

`settlements`·`coupons`는 401, `billing`·`customer-support`는 404다. 각각 `wallets`·`lectures`·`inquiries` 명세에 들어 있다.

명세의 `Pageable` 파라미터는 `arg1`·`pageable`로 보인다. 실제로는 `page`·`size` 쿼리다.

## 명세로 FE 빈 곳 찾기

BE에 생긴 API·응답 필드·상태 값을 FE가 쓰는지 한 번에 본다(2026-11-09 점검, FE #200~#205의 근거).

1. 위 6개 모듈의 명세 JSON을 받는다.
2. FE `src`에서 테스트를 뺀 파일의 식별자를 모은다.
3. 공개 경로(`/internal/`·`backfill` 제외)와 그 경로가 참조하는 스키마를 따라가며, 스키마의 속성 이름과 enum 값(배열 항목·별도 enum 스키마·경로 파라미터 포함) 중 2에 없는 것을 뽑는다.

남는 것은 FE가 쓰지 않는 응답 필드·상태 값의 후보이고, 그 필드가 속한 경로가 FE 화면이 없는 API의 후보다. 전수 검사가 아니다.

놓치는 것:

- 식별자 파일은 FE 소스의 모든 단어를 스키마와 상관없이 모은 것이다. `id`·`status`·`type`·`name`처럼 FE 어딘가에 있는 단어는, 그 이름의 BE 필드를 FE가 쓰지 않아도 "쓰는 것"으로 판정된다. 흔한 이름의 새 필드는 남지 않으니 BE 변경 기록(커밋·PR)과 함께 본다.
- 같은 이유로 `PENDING`·`COMPLETED`처럼 다른 도메인에서 쓰는 상태 값도 남지 않는다.

잘못 뽑는 것:

- 이름이 다르게 쓰이거나 화면에 필요 없는 필드일 수 있다. 하나씩 BE 설명을 읽고 판단한다.
- 일부 템플릿은 필드를 읽지 않고 종류만으로 문구를 만든다(예: 단체방 `GROUP_HOST_UNAVAILABLE`).
- 명세의 enum이 실제 응답보다 넓을 수 있다. 쿠폰 발급 접수 `result`는 명세에 `SOLD_OUT` 등도 있지만, 성공 응답으로는 `ACCEPTED`·`ALREADY_ACCEPTED`만 오고 나머지는 오류 코드로 온다(BE `IssueRequestResult` 주석).

FE가 호출하는 경로는 `src`에서 `/members`·`/lectures` 같은 문자열을 모아 BE 경로와 맞춰 본다. `${...}`는 경로 변수로 바꿔 비교한다.

```python
# python3 -I check.py <명세 폴더> <FE 식별자 파일>
# 출력: 모듈, 경로 또는 스키마, FE에 없는 속성, FE에 없는 enum 값
import json, os, sys
spec_dir, ident_file = sys.argv[1], sys.argv[2]
idents = set(open(ident_file).read().split())

def collect(o, refs, enums):
    """$ref 이름과 enum 값을 어디에 있든(배열 items, 파라미터 schema 포함) 모은다"""
    if isinstance(o, dict):
        for k, v in o.items():
            if k == '$ref': refs.add(v.split('/')[-1])
            elif k == 'enum': enums.update(x for x in v if isinstance(x, str))
            else: collect(v, refs, enums)
    elif isinstance(o, list):
        for v in o: collect(v, refs, enums)

for m in ['members', 'wallets', 'appearances', 'lectures', 'chats', 'inquiries']:
    d = json.load(open(os.path.join(spec_dir, m + '.json')))
    schemas, refs, rows = d['components']['schemas'], set(), []
    for p, ops in d['paths'].items():
        if '/internal/' in p or 'backfill' in p: continue
        enums = set(); collect(ops, refs, enums)
        if enums - idents: rows.append((p, [], sorted(enums - idents)))
    done = set()
    while refs - done:  # 참조한 스키마 안의 참조까지
        name = (refs - done).pop(); done.add(name)
        s = schemas.get(name, {}); enums = set()
        collect(s, refs, enums)
        fields = [k for k in s.get('properties', {}) if k not in idents]
        if fields or enums - idents: rows.append((name, fields, sorted(enums - idents)))
    for where, fields, enums in sorted(rows): print(m, where, fields, enums, sep='\t')
```

FE 식별자 파일은 예를 들어 이렇게 만든다(zsh에서는 `grep`이 다른 도구일 수 있어 `command grep`).

```sh
find src \( -name '*.ts' -o -name '*.tsx' \) | command grep -vE '\.test\.|/test/' | xargs cat \
  | command grep -oE '[A-Za-z_][A-Za-z0-9_]*' | sort -u > idents.txt
```
