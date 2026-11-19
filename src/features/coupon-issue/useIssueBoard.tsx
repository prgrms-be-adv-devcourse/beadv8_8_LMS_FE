import { useCallback, useRef, useState, type ReactNode } from 'react'
import type { CouponSummary } from '@/entities/coupon/types'
import {
  bulkResultOf,
  IDLE,
  tallyIssues,
  type BulkResult,
  type IssueTally,
} from './issueView'
import { IssueSlot, type IssueHandle } from './IssueSlot'
import type { IssueCouponState } from './useIssueCoupon'

/** 모두 받기 진행(보낸 수/보낼 수) */
export type BulkProgress = { total: number; done: number }

export type IssueBoard = {
  /** 쿠폰마다 발급 훅을 쥔 자리(그리는 것은 없다). 목록을 닫았다 열어도 이어지게 목록 밖에 그린다 */
  slots: ReactNode
  stateOf: (couponId: number) => IssueCouponState
  tally: IssueTally
  /** 쿠폰 한 장을 받는다 */
  issue: (couponId: number) => void
  /** 받을 수 있는 쿠폰을 목록 순서대로 한 장씩 보내고, 앞 쿠폰의 처리가 끝나면 다음으로 간다 */
  issueAll: () => Promise<void>
  /** 모두 받기 중이면 진행, 아니면 null */
  bulk: BulkProgress | null
  /** 마지막 모두 받기의 결과 */
  bulkResult: BulkResult | null
  /** 모두 받기 중이 아니면 지난 결과 안내를 지운다 */
  clearResult: () => void
}

/**
 * 쿠폰 목록의 발급 상태와 '모두 받기'. 강의 상세 팝업과 쿠폰 받기 화면이 같이 쓴다.
 * 발급 훅은 쿠폰마다 slots 안에 두어, 목록(팝업)을 닫았다 열어도 요청 ID·진행 상태가 이어지고 모두 받기도 멈추지 않는다.
 */
export function useIssueBoard(coupons: CouponSummary[]): IssueBoard {
  const [states, setStates] = useState<Record<number, IssueCouponState>>({})
  const handles = useRef(new Map<number, IssueHandle>())
  const running = useRef(false)
  const [bulk, setBulk] = useState<BulkProgress | null>(null)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)

  const onState = useCallback(
    (couponId: number, state: IssueCouponState) =>
      setStates((prev) =>
        sameState(prev[couponId], state)
          ? prev
          : { ...prev, [couponId]: state },
      ),
    [],
  )
  const onHandle = useCallback(
    (couponId: number, handle: IssueHandle | null) => {
      if (handle) handles.current.set(couponId, handle)
      else handles.current.delete(couponId)
    },
    [],
  )

  const stateOf = (couponId: number) => states[couponId] ?? IDLE
  const tally = tallyIssues(coupons, stateOf)

  const issueAll = async () => {
    const targets = tally.requestable.map((c) => c.couponId)
    if (running.current || targets.length === 0) return
    running.current = true
    setBulkResult(null)
    setBulk({ total: targets.length, done: 0 })
    const settled: (IssueCouponState | null)[] = []
    for (const couponId of targets) {
      const handle = handles.current.get(couponId)
      settled.push(handle ? await handle.issueAndWait() : null)
      setBulk((b) => b && { ...b, done: b.done + 1 })
    }
    running.current = false
    setBulk(null)
    setBulkResult(bulkResultOf(settled))
  }

  return {
    slots: coupons.map((coupon) => (
      <IssueSlot
        key={coupon.couponId}
        couponId={coupon.couponId}
        onState={onState}
        onHandle={onHandle}
      />
    )),
    stateOf,
    tally,
    issue: (couponId) => handles.current.get(couponId)?.issue(),
    issueAll,
    bulk,
    bulkResult,
    clearResult: () => {
      if (!running.current) setBulkResult(null)
    },
  }
}

const sameState = (a: IssueCouponState | undefined, b: IssueCouponState) =>
  a !== undefined && JSON.stringify(a) === JSON.stringify(b)
