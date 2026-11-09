import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import {
  couponKeys,
  fetchIssueStatus,
  requestCouponIssue,
} from '@/entities/coupon/api'
import type { IssueStatus, IssueStatusView } from '@/entities/coupon/types'
import { isApiError } from '@/shared/api/ApiError'

/** 발급 상태를 다시 보는 간격 */
export const ISSUE_POLL_INTERVAL_MS = 1000
/** 발급 상태를 보는 최대 횟수. 넘으면 처리 중으로 두고 쿠폰함에서 확인하게 한다 */
export const ISSUE_POLL_MAX = 10

/** 처리 중이 너무 길 때 */
export const ISSUE_DELAYED_MESSAGE =
  '처리 중입니다. 잠시 후 쿠폰함에서 확인해 주세요'
/** 서버가 발급 결과를 확인하지 못했을 때(UNKNOWN) */
export const ISSUE_UNKNOWN_MESSAGE =
  '확인할 수 없습니다. 잠시 후 다시 시도해 주세요'
/** 서버가 발급 요청 기록을 찾지 못했을 때 */
export const ISSUE_NOT_FOUND_MESSAGE =
  '발급 요청을 찾지 못했어요. 다시 시도해 주세요'

/** 발급 접수 오류 코드별 문구. BE detail이 아니라 code로 고른다 */
const ISSUE_ERROR_MESSAGES: Record<string, string> = {
  COUPON_SOLD_OUT: '모두 소진됐어요',
  COUPON_ALREADY_ISSUED: '이미 받은 쿠폰이에요',
  COUPON_ISSUE_NOT_IN_PERIOD: '발급 기간이 아니에요',
  COUPON_ISSUE_NOT_OPEN: '지금은 받을 수 없어요',
  // 새 요청 ID로 한 번 다시 보내고도 겹쳤을 때만 보인다(다음 시도는 새 ID로 간다).
  ISSUE_REQUEST_ID_CONFLICT: '요청이 겹쳤어요. 다시 시도해 주세요',
}

/**
 * 발급 접수 실패 문구. 409는 코드별 문구, 503은 코드와 관계없이 잠시 뒤 다시, 응답을 받지 못했으면(네트워크 오류)
 * 다시 누르라고 하고, 그 밖에는 오류의 문구를 쓴다
 */
export function issueErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    const known = ISSUE_ERROR_MESSAGES[error.code]
    if (known) return known
    if (error.status === 503) return '잠시 후 다시 시도해 주세요'
    return error.message
  }
  return '요청을 보내지 못했어요. 다시 눌러 주세요'
}

/**
 * 같은 요청 ID로 다시 보냈는데 409 COUPON_SOLD_OUT이면 상태를 한 번 본다. 처음 보낸 접수가 이미 받아들여졌을 수 있다
 * (BE는 소진을 메모리에 1초 동안 기억해 접수 기록을 보기 전에 소진으로 답한다). 처음 보낸 요청의 소진은 그대로 믿는다
 */
export function needsSoldOutLookup(error: unknown, resent: boolean): boolean {
  return resent && isApiError(error, 'COUPON_SOLD_OUT')
}

/**
 * 소진 응답 뒤 상태 조회 결과로 정한다. 접수 기록이 없으면(NOT_FOUND) 정말 소진이고,
 * 그 밖(PENDING·ISSUED 등)은 접수된 것으로 보고 평소처럼 상태를 이어 본다
 */
export function soldOutRetryOutcome(status: string): 'soldOut' | 'accepted' {
  return status === 'NOT_FOUND' ? 'soldOut' : 'accepted'
}

export type IssuePollDecision =
  /** 아직 PENDING이라 다시 본다 */
  | 'continue'
  /** 결과가 나왔다(PENDING이 아닌 모든 상태, 모르는 값 포함) */
  | 'done'
  /** 정해진 횟수만큼 봐도 PENDING이다(조회 실패 포함) */
  | 'timedOut'

/**
 * 발급 상태 폴링을 이어 갈지. polls는 지금까지 본 횟수(성공·실패 모두)다.
 * PENDING이거나 아직 응답이 없으면(조회 실패만 있었으면) 다시 보고, ISSUE_POLL_MAX번을 채우면 멈춘다
 */
export function issuePollDecision(
  status: IssueStatus | string | undefined,
  polls: number,
): IssuePollDecision {
  if (status !== undefined && status !== 'PENDING') return 'done'
  return polls >= ISSUE_POLL_MAX ? 'timedOut' : 'continue'
}

export type IssueCouponState =
  | { phase: 'idle' }
  /** 접수 중이거나 접수 뒤 결과를 기다린다 */
  | { phase: 'processing' }
  /** 발급됐다. expiresAt은 접수(202) 응답의 만료 시각(소진 응답 뒤 조회로 확인했으면 없다) */
  | { phase: 'issued'; expiresAt: string | null }
  | { phase: 'rejected'; reason: string | null }
  /** 10번 봐도 PENDING(조회 실패 포함). 같은 요청 ID로 다시 누를 수 있다 */
  | { phase: 'delayed' }
  /** 서버가 결과를 확인하지 못했다(UNKNOWN, 모르는 상태 값). 같은 요청 ID로 다시 누를 수 있다 */
  | { phase: 'unknown' }
  /** 접수 실패 또는 NOT_FOUND. 소진·이미 받음(code)이 아니면 같은 요청 ID로 다시 누를 수 있다 */
  | { phase: 'failed'; message: string; code: string | null }

/** 접수된 요청. round는 같은 요청 ID로 다시 접수할 때마다 늘려 폴링 횟수를 처음부터 센다 */
type Accepted = { id: string; expiresAt: string | null; round: number }

/** 접수 결과. view는 소진 응답 뒤 한 번 본 상태(그때만 있다) */
type Sent = {
  id: string
  expiresAt: string | null
  view: IssueStatusView | null
}

const statusKeyOf = (couponId: number, id: string, round: number) => [
  ...couponKeys.issueStatus(couponId, id),
  round,
]

/**
 * 쿠폰 한 장의 발급 요청.
 * - 요청 ID(멱등 키)는 처음 누를 때 한 번 만들어 훅에만 둔다(서버에 묻거나 storage에 두지 않는다). 응답을 못 받았거나
 *   결과를 확인하지 못해 다시 누르면 같은 ID로 보낸다(BE가 ALREADY_ACCEPTED로 답하고 성공으로 본다).
 * - ISSUE_REQUEST_ID_CONFLICT(같은 ID가 다른 요청에 쓰였다)면 새 ID를 만들어 한 번만 자동으로 다시 보낸다.
 * - 같은 ID로 다시 보낸 요청이 소진(409)이면 상태를 한 번 보고 정한다(needsSoldOutLookup).
 * - 접수(202) 뒤에는 처리 상태를 1초 간격으로 최대 10번(실패 포함) 본다. 발급되면 쿠폰함과 이 강의의 쿠폰 목록을
 *   다시 불러온다.
 */
export function useIssueCoupon(couponId: number, lectureId: number) {
  const queryClient = useQueryClient()
  const requestId = useRef<string | null>(null)
  /** 마지막으로 서버에 보낸 요청 ID(응답을 못 받았어도 보낸 것으로 본다) */
  const sentId = useRef<string | null>(null)
  const round = useRef(0)
  const [accepted, setAccepted] = useState<Accepted | null>(null)

  // 발급 상태 조회와 겹치지 않는 키만 무효화한다(발급 상태 키는 'issue' 아래다).
  const refreshIssued = () => {
    void queryClient.invalidateQueries({
      queryKey: [...couponKeys.all, 'mine'],
    })
    void queryClient.invalidateQueries({
      queryKey: couponKeys.forLecture(lectureId),
    })
  }

  const request = useMutation({
    mutationFn: async (): Promise<Sent> => {
      const id = (requestId.current ??= crypto.randomUUID())
      const resent = sentId.current === id
      sentId.current = id
      try {
        const result = await requestCouponIssue(couponId, id)
        return { id, expiresAt: result.expiresAt, view: null }
      } catch (error) {
        if (isApiError(error, 'ISSUE_REQUEST_ID_CONFLICT')) {
          const fresh = crypto.randomUUID()
          requestId.current = fresh
          sentId.current = fresh
          const result = await requestCouponIssue(couponId, fresh)
          return { id: fresh, expiresAt: result.expiresAt, view: null }
        }
        if (!needsSoldOutLookup(error, resent)) throw error
        const view = await fetchIssueStatus(couponId, id)
        if (soldOutRetryOutcome(view.status) === 'soldOut') throw error
        return { id, expiresAt: null, view }
      }
    },
    onSuccess: (sent) => {
      round.current += 1
      const next = round.current
      // 소진 응답 뒤 본 상태를 첫 조회로 넣는다(한 번 더 묻지 않고, 10번 안에 센다).
      if (sent.view) {
        queryClient.setQueryData(
          statusKeyOf(couponId, sent.id, next),
          sent.view,
        )
        if (sent.view.status === 'ISSUED') refreshIssued()
      }
      setAccepted((before) => ({
        id: sent.id,
        expiresAt:
          sent.expiresAt ?? (before?.id === sent.id ? before.expiresAt : null),
        round: next,
      }))
    },
  })

  const statusKey = statusKeyOf(
    couponId,
    accepted?.id ?? '',
    accepted?.round ?? 0,
  )
  const poll = useQuery({
    queryKey: statusKey,
    queryFn: async () => {
      const view = await fetchIssueStatus(couponId, accepted!.id)
      if (view.status === 'ISSUED') refreshIssued()
      return view
    },
    enabled: accepted !== null,
    staleTime: Infinity,
    // 폴링이 곧 재시도다. 조회 실패도 한 번으로 센다.
    retry: false,
    refetchInterval: (query) =>
      issuePollDecision(
        query.state.data?.status,
        query.state.dataUpdateCount + query.state.errorUpdateCount,
      ) === 'continue'
        ? ISSUE_POLL_INTERVAL_MS
        : false,
  })

  const issue = () => {
    if (request.isPending) return
    request.mutate()
  }

  return { state: stateOf(), issue }

  function stateOf(): IssueCouponState {
    if (request.isPending) return { phase: 'processing' }
    if (request.error)
      return {
        phase: 'failed',
        message: issueErrorMessage(request.error),
        code: isApiError(request.error) ? request.error.code : null,
      }
    if (!accepted) return { phase: 'idle' }

    const view = poll.data
    switch (view?.status) {
      case 'ISSUED':
        return { phase: 'issued', expiresAt: accepted.expiresAt }
      case 'REJECTED':
        return { phase: 'rejected', reason: view.rejectReason ?? null }
      case 'NOT_FOUND':
        return {
          phase: 'failed',
          message: ISSUE_NOT_FOUND_MESSAGE,
          code: 'NOT_FOUND',
        }
      case 'PENDING':
      case undefined:
        break
      // UNKNOWN과 BE가 새로 보낸 모르는 값
      default:
        return { phase: 'unknown' }
    }
    // 성공·실패 시각을 읽어 같은 PENDING이나 같은 실패가 와도 다시 그린다(횟수는 쿼리 상태에만 있다).
    const touched = poll.dataUpdatedAt + poll.errorUpdatedAt > 0
    const state = touched ? queryClient.getQueryState(statusKey) : undefined
    const polls = (state?.dataUpdateCount ?? 0) + (state?.errorUpdateCount ?? 0)
    return issuePollDecision(view?.status, polls) === 'timedOut'
      ? { phase: 'delayed' }
      : { phase: 'processing' }
  }
}
