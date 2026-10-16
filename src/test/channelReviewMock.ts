import { http, HttpResponse, type AnyHandler } from 'msw'
import type { ChannelReview } from '@/entities/member/types'
import type { PagedModel, RsData } from '@/shared/api/types'

/**
 * 테스트 전용: 관리자 채널 인증 심사(GET /members/admin/channels, 승인·반려)를 BE처럼 흉내 내는 MSW 핸들러.
 * 데이터는 메모리에 두고 테스트마다 resetChannelReviewDb()로 초기화한다. 응답 형식은 BE ChannelReviewResponse와 같다.
 * 개발 서버에서는 쓰지 않는다(실제 BE를 쓴다).
 */

const sample = (): ChannelReview[] => [
  {
    channelId: 101,
    memberId: 21,
    nickname: '새벽기타',
    platform: 'CHZZK',
    channelName: '새벽기타 라이브',
    channelUrl: 'https://chzzk.naver.com/dawnguitar',
    followerCount: 7,
    followerCountAt: '2026-10-14T09:00:00',
    status: 'PENDING',
    requestedAt: '2026-10-14T10:00:00',
    verifiedAt: null,
    verifiedBy: null,
    rejectionReason: null,
  },
  {
    channelId: 102,
    memberId: 22,
    nickname: '편집하는 고래',
    platform: 'CHZZK',
    channelName: '고래의 편집실',
    channelUrl: 'https://chzzk.naver.com/whale',
    followerCount: 3,
    followerCountAt: null,
    status: 'PENDING',
    requestedAt: '2026-10-15T08:30:00',
    verifiedAt: null,
    verifiedBy: null,
    rejectionReason: null,
  },
  {
    channelId: 103,
    memberId: 23,
    nickname: '하루',
    platform: 'CHZZK',
    channelName: '하루의 게임방',
    channelUrl: 'https://chzzk.naver.com/haru',
    followerCount: 9,
    followerCountAt: '2026-10-10T12:00:00',
    status: 'APPROVED',
    requestedAt: '2026-10-10T12:00:00',
    verifiedAt: '2026-10-11T09:00:00',
    verifiedBy: 7,
    rejectionReason: null,
  },
  {
    // 팔로워 기준을 넘어 등록하자마자 자동 승인: 승인 요청·처리한 관리자가 없다
    channelId: 105,
    memberId: 25,
    nickname: '별빛',
    platform: 'CHZZK',
    channelName: '별빛 노래방',
    channelUrl: 'https://chzzk.naver.com/starlight',
    followerCount: 120,
    followerCountAt: '2026-10-08T15:00:00',
    status: 'APPROVED',
    requestedAt: null,
    verifiedAt: '2026-10-08T15:00:00',
    verifiedBy: null,
    rejectionReason: null,
  },
  {
    channelId: 104,
    memberId: 24,
    nickname: '노을',
    platform: 'CHZZK',
    channelName: '노을 라디오',
    channelUrl: 'https://chzzk.naver.com/noeul',
    followerCount: 2,
    followerCountAt: '2026-10-09T18:00:00',
    status: 'REJECTED',
    requestedAt: '2026-10-09T18:00:00',
    verifiedAt: '2026-10-10T10:00:00',
    verifiedBy: 7,
    rejectionReason: '본인 채널인지 확인되지 않아요',
  },
]

export const channelReviewDb = { channels: sample() }

export function resetChannelReviewDb() {
  channelReviewDb.channels = sample()
}

const ok = <T>(data: T) =>
  HttpResponse.json<RsData<T>>({ statusCode: 200, message: 'mock', data })

const problem = (status: number, code: string, detail: string) =>
  HttpResponse.json({ status, code, detail }, { status })

function page<T>(items: T[], url: URL): PagedModel<T> {
  const number = Number(url.searchParams.get('page') ?? 0)
  const size = Number(url.searchParams.get('size') ?? 20)
  return {
    content: items.slice(number * size, number * size + size),
    page: {
      number,
      size,
      totalElements: items.length,
      totalPages: Math.ceil(items.length / size),
    },
  }
}

/** KST LocalDateTime 문자열 (BE와 같은 형식) */
function nowKst() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 19)
}

/** 심사 대기 채널을 찾는다. 없으면 BE와 같은 오류 응답 */
function findReviewable(channelId: number) {
  const channel = channelReviewDb.channels.find(
    (c) => c.channelId === channelId,
  )
  if (!channel)
    return problem(404, 'CHANNEL_NOT_FOUND', '채널을 찾을 수 없습니다.')
  if (channel.status !== 'PENDING')
    return problem(
      409,
      'CHANNEL_REVIEW_NOT_ALLOWED',
      '심사 대기 중인 채널만 승인·반려할 수 있습니다.',
    )
  return channel
}

export const channelReviewHandlers: AnyHandler[] = [
  http.get('*/api/v1/members/admin/channels', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') ?? 'PENDING'
    // 오래된 신청부터 (BE와 같은 고정 정렬)
    const items = channelReviewDb.channels
      .filter((c) => c.status === status)
      .sort((a, b) =>
        (a.requestedAt ?? a.followerCountAt ?? '').localeCompare(
          b.requestedAt ?? b.followerCountAt ?? '',
        ),
      )
    return ok(page(items, url))
  }),
  http.post(
    '*/api/v1/members/admin/channels/:channelId/approve',
    ({ params }) => {
      const found = findReviewable(Number(params.channelId))
      if (found instanceof Response) return found
      Object.assign(found, {
        status: 'APPROVED',
        verifiedAt: nowKst(),
        verifiedBy: 7,
      })
      return new HttpResponse(null, { status: 204 })
    },
  ),
  http.post(
    '*/api/v1/members/admin/channels/:channelId/reject',
    async ({ params, request }) => {
      const { reason } = (await request.json()) as { reason?: string }
      const trimmed = reason?.trim() ?? ''
      if (!trimmed || trimmed.length > 500)
        return problem(400, 'INVALID_REQUEST', '반려 사유를 입력해 주세요.')
      const found = findReviewable(Number(params.channelId))
      if (found instanceof Response) return found
      Object.assign(found, {
        status: 'REJECTED',
        verifiedAt: nowKst(),
        verifiedBy: 7,
        rejectionReason: trimmed,
      })
      return new HttpResponse(null, { status: 204 })
    },
  ),
]
