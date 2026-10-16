import { useEffect, useState, type FocusEvent } from 'react'
import { isApiError } from '@/shared/api/ApiError'
import { focusFirstInvalid } from './focusFirstInvalid'

type Options<K extends string> = {
  /** 화면 순서대로 둔 칸 이름과 그 입력칸 id (오류 문구 id는 `${id}-error`) */
  ids: Record<K, string>
  order: readonly K[]
  /** 지금 값으로 검사한 오류. 매 렌더마다 다시 계산해 넘긴다 */
  errors: Partial<Record<K, string | undefined>>
}

/**
 * 폼 칸의 오류를 언제 보여 줄지 정한다.
 * - 처음 열 때는 보여 주지 않는다
 * - 칸을 떠나면(blur) 그 칸의 오류를 보여 준다
 * - 앞 칸을 건너뛰고 아래 칸(선택 칸·버튼 등 form 안 아무 요소)에 포커스하면, 건너뛴 칸 중
 *   화면 순서상 가장 위의 오류 칸 하나만 보여 준다(그 위에 이미 보이는 오류가 있으면 더 늘리지 않는다).
 *   form에 formProps를 펼쳐야 한다
 * - 보여 준 칸은 값을 고칠 때마다 다시 검사해 고쳐지면 바로 사라진다
 * - 서버 400 필드 오류(errors[])는 그 칸을 고치기 전까지 보여 주고, 렌더가 끝나면 첫 오류 칸으로 포커스한다
 * 검사 오류로 막힌 제출 버튼은 disabled 대신 aria-disabled로 막힌 모양만 두고 클릭(Enter 제출 포함)을 받는다.
 * 제출 처리 첫머리에서 blockSubmit()을 불러, 오류가 있으면 화면 순서상 첫 오류 칸 하나만 보여 주고
 * 그 칸으로 포커스·스크롤한 뒤 제출하지 않는다.
 */
export function useFieldErrors<K extends string>({
  ids,
  order,
  errors,
}: Options<K>) {
  const [touched, setTouched] = useState<ReadonlySet<K>>(() => new Set())
  const [serverErrors, setServerErrors] = useState<Partial<Record<K, string>>>(
    {},
  )
  const [focusRequest, setFocusRequest] = useState(0)
  useEffect(() => {
    if (focusRequest === 0) return
    // 칸이 든 form 전체에서 찾는다(이 훅이 모르는 칸의 오류도 화면 순서대로 포함).
    const elements = order.map((k) => document.getElementById(ids[k]))
    const form = elements.find((el) => el)?.closest('form') ?? null
    if (focusFirstInvalid(form)) return
    focusFirstInvalid(
      elements.find((el) => el?.getAttribute('aria-invalid') === 'true')
        ?.parentElement ?? null,
    )
    // 요청이 바뀔 때만 실행한다(ids·order는 렌더마다 새 객체일 수 있다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest])

  const touch = (key: K) =>
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))
  const shownError = (key: K) =>
    serverErrors[key] ?? (touched.has(key) ? errors[key] : undefined)

  /** form 안에서 포커스가 옮겨 오면, 그 요소보다 화면에서 앞에 있는 칸을 건너뛴 칸으로 본다 */
  const onFormFocus = (e: FocusEvent<HTMLElement>) => {
    const target = e.target
    const skipped = order.filter((k) => {
      const el = document.getElementById(ids[k])
      return (
        el !== null &&
        el !== target &&
        Boolean(
          el.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING,
        )
      )
    })
    if (skipped.some((k) => shownError(k))) return
    const first = skipped.find((k) => errors[k] && !touched.has(k))
    if (first) touch(first)
  }

  const focusInvalid = () => setFocusRequest((n) => n + 1)
  const showServerErrors = (list: { field: string; message: string }[]) => {
    const mine = list.filter((e) => Object.hasOwn(ids, e.field))
    if (mine.length === 0) return false
    setServerErrors(
      Object.fromEntries(mine.map((e) => [e.field, e.message])) as Partial<
        Record<K, string>
      >,
    )
    // 서버 오류가 난 칸은 건드린 칸으로 본다: 고치는 중에도 클라이언트 오류가 남으면 계속 보여 준다.
    setTouched((prev) => {
      const next = new Set(prev)
      for (const e of mine) next.add(e.field as K)
      return next
    })
    focusInvalid()
    return true
  }

  const hasErrors = order.some((k) => errors[k])

  return {
    /** 검사 오류가 하나라도 있으면 true (보이는지와 상관없다) */
    hasErrors,
    /** 제출 버튼에 펼친다: 검사 오류가 있으면 aria-disabled (disabled는 부르는 쪽이 따로 정한다) */
    submitProps: { 'aria-disabled': hasErrors || undefined },
    /**
     * 제출 처리 첫머리에서 부른다. 검사 오류가 있으면 화면 순서상 첫 오류 칸 하나만 보여 주고
     * 렌더 뒤 그 칸으로 포커스한 다음 true(제출 막힘)를 돌려준다.
     */
    blockSubmit: () => {
      const invalid = order.filter((k) => errors[k])
      if (invalid.length === 0) return false
      // 지금 화면에 없는 칸(불러오는 중 등)은 건너뛴다.
      touch(invalid.find((k) => document.getElementById(ids[k])) ?? invalid[0])
      focusInvalid()
      return true
    },
    /** 지금 보여 줄 오류. Field의 error로 넘긴다 */
    error: shownError,
    /** form에 펼친다: 건너뛴 칸 기록 */
    formProps: { onFocus: onFormFocus },
    /** 입력칸에 펼친다: id·오류 상태·오류 문구 연결과 떠난 칸 기록 */
    inputProps: (key: K) => {
      const shown = Boolean(shownError(key))
      return {
        id: ids[key],
        'aria-invalid': shown || undefined,
        'aria-describedby': shown ? `${ids[key]}-error` : undefined,
        onBlur: () => touch(key),
      }
    },
    /** 값을 바꿀 때 부른다. 그 칸의 서버 오류를 지운다 */
    changed: (key: K) =>
      setServerErrors((prev) =>
        prev[key] === undefined ? prev : { ...prev, [key]: undefined },
      ),
    /** 제출에 성공해 값을 비울 때 부른다. 처음 연 상태(오류 안 보임)로 돌린다 */
    reset: () => {
      setTouched(new Set())
      setServerErrors({})
    },
    /**
     * 제출 실패에서 부른다. 이 폼 칸의 서버 400 필드 오류가 있으면 표시하고
     * 렌더 뒤 첫 오류 칸으로 포커스한 다음 true를 돌려준다.
     */
    applyServerErrors: (error: unknown) =>
      isApiError(error) && showServerErrors(error.errors),
    /** 서버 필드 오류를 직접 표시한다(errors[]가 아닌 코드로 칸을 알 때). 이 폼 칸이 있으면 true */
    showServerErrors,
    /** 렌더가 끝나면 칸이 든 form의 첫 오류 칸([aria-invalid="true"])으로 포커스한다 */
    focusInvalid,
  }
}
