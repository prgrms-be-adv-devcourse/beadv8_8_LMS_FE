import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { parseServerDate } from './date'

/** HP 보류 결과를 기다리는 동안 목록을 다시 부르는 간격 */
export const HOLD_POLL_INTERVAL_MS = 5_000
/**
 * 보낸 시각부터 기다리는 시간. BE 보류 재확인 배치는 매분 00초에 만든 지 1분 지난 글만 가져가
 * 결과가 보낸 뒤 60~120초에 나온다. 여유를 둔 값이다.
 */
export const HOLD_POLL_DURATION_MS = 150_000
/**
 * 새 글 판단의 시계 차이 여유. 보낸 시각은 브라우저 시계, createdAt은 서버 시계(KST)라
 * 브라우저 시계가 이만큼 빨라도 방금 보낸 글을 새 글로 본다.
 */
export const HOLD_CLOCK_SKEW_MS = 10_000

/** 주소 값 → 보낸 시각(ms). 예전 형식(=1)이나 잘못된 값이면 null */
export function parseHoldPendingSince(value: string | null): number | null {
  if (value === null || !/^\d{13,}$/.test(value)) return null
  return Number(value)
}

/**
 * 보류 확인이 늦어진(503 BILLING_UNAVAILABLE 등) 글을 목록에서 기다린다.
 * - 보낸 시각을 주소에 두어 새로고침·재진입해도 남은 시간만 기다리고, 새로 보내면 다시 기다린다
 * - polling인 동안 목록을 HOLD_POLL_INTERVAL_MS마다 다시 부른다. 보낸 시각 + HOLD_POLL_DURATION_MS까지만
 * - 새 글이 보이면 useHoldPendingFound로 멈춘다
 * BE가 보류 확인 중인 글을 본인에게 보여 주게 되면(BE #306) 없앤다.
 *
 * @param value 주소의 holdPending 값(보낸 시각 ms). 없으면 기다리지 않는다
 * @param restart 예전 형식(=1)·잘못된 값이면 지금 시각으로 바꿔 쓴다(주소 replace)
 */
export function useHoldPendingWait(
  value: string | null,
  restart: (since: number) => void,
) {
  const since = parseHoldPendingSince(value)
  const [expiredFor, setExpiredFor] = useState<number | null>(null)

  useEffect(() => {
    if (value !== null && since === null) restart(Date.now())
  }, [value, since, restart])

  useEffect(() => {
    if (since === null) return
    const remaining = since + HOLD_POLL_DURATION_MS - Date.now()
    const timer = setTimeout(() => setExpiredFor(since), Math.max(0, remaining))
    return () => clearTimeout(timer)
  }, [since])

  return {
    since,
    /** 안내를 보여 줄지 */
    waiting: value !== null,
    /** 아직 기다리는 시간 안인지(다시 부르기) */
    polling: since !== null && expiredFor !== since,
  }
}

/**
 * 기다리는 동안(시간이 지난 뒤 직접 새로고침한 경우 포함) 보낸 시각 이후 만든 글이 목록에 보이면
 * 보낸 시각마다 한 번 onFound를 부른다(토스트·안내 닫기).
 *
 * @param createdAts 지금 목록 글들의 만든 시각(서버 KST)
 */
export function useHoldPendingFound(
  since: number | null,
  createdAts: readonly string[] | undefined,
  onFound: () => void,
) {
  const found = useRef<number | null>(null)
  const hasNew =
    since !== null &&
    (createdAts ?? []).some(
      (c) => parseServerDate(c).getTime() >= since - HOLD_CLOCK_SKEW_MS,
    )
  useEffect(() => {
    if (since === null || !hasNew || found.current === since) return
    found.current = since
    onFound()
  }, [since, hasNew, onFound])
}

/**
 * 주소의 보류 대기 파라미터로 기다린다. enabled가 아니면(다른 탭 등) 기다리지 않는다.
 * dismiss는 안내를 닫는다(파라미터 삭제, 주소 교체).
 */
export function useHoldPendingParam(param: string, enabled: boolean) {
  const [params, setParams] = useSearchParams()
  const value = enabled ? params.get(param) : null
  const restart = useCallback(
    (since: number) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set(param, String(since))
          return next
        },
        { replace: true },
      ),
    [setParams, param],
  )
  // 주소를 교체한다: 대기 주소가 기록에 남으면 뒤로 가기로 끝난 대기(안내·다시 부르기·토스트)가 되살아난다.
  const dismiss = useCallback(
    () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete(param)
          return next
        },
        { replace: true },
      ),
    [setParams, param],
  )
  return { ...useHoldPendingWait(value, restart), dismiss }
}
