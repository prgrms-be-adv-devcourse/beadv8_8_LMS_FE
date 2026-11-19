import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useIssueCoupon, type IssueCouponState } from './useIssueCoupon'

/** 쿠폰 한 장의 발급 손잡이. '모두 받기'는 issueAndWait로 한 장씩 결과(처리 중이 끝난 상태)를 기다린다 */
export type IssueHandle = {
  issue: () => void
  /** 보내고 처리 중이 끝나면 그 상태로 풀린다. 그사이 쿠폰이 목록에서 빠지면 null */
  issueAndWait: () => Promise<IssueCouponState | null>
}

/**
 * 쿠폰 한 장의 발급 훅을 쥐고 상태와 손잡이를 위로 알린다(그리는 것은 없다).
 * issueAndWait는 보낸 차례(attempt)를 상태로 두어, 그 차례 이후에 그린 상태만 결과로 본다.
 */
export function IssueSlot({
  couponId,
  onState,
  onHandle,
}: {
  couponId: number
  onState: (couponId: number, state: IssueCouponState) => void
  onHandle: (couponId: number, handle: IssueHandle | null) => void
}) {
  const { state, issue } = useIssueCoupon(couponId)
  const latestIssue = useRef(issue)
  useLayoutEffect(() => {
    latestIssue.current = issue
  })
  const sent = useRef(0)
  const [attempt, setAttempt] = useState(0)
  const waiter = useRef<{
    attempt: number
    resolve: (state: IssueCouponState | null) => void
  } | null>(null)

  useLayoutEffect(() => {
    onHandle(couponId, {
      issue: () => latestIssue.current(),
      issueAndWait: () =>
        new Promise((resolve) => {
          waiter.current?.resolve(null)
          sent.current += 1
          waiter.current = { attempt: sent.current, resolve }
          setAttempt(sent.current)
          latestIssue.current()
        }),
    })
    return () => {
      onHandle(couponId, null)
      waiter.current?.resolve(null)
      waiter.current = null
    }
  }, [couponId, onHandle])

  useEffect(() => {
    onState(couponId, state)
    const pending = waiter.current
    if (pending?.attempt === attempt && state.phase !== 'processing') {
      waiter.current = null
      pending.resolve(state)
    }
  }, [attempt, couponId, onState, state])

  return null
}
