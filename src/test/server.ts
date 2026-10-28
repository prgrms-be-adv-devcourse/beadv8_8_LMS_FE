import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

/**
 * 화면과 상관없이 나가는 요청의 기본 응답. 테스트마다 server.use(...)로 덮어쓴다.
 * - 채팅 방 목록: 인플루언서·관리자는 내비 안 읽은 수 배지를 위해 항상 부른다
 * - 강의 목록: 비회원·권한 없는 회원을 첫 화면(/lectures)으로 보낼 때 부른다
 * - 성립한 출연 목록: 내 출연 화면이 요청 목록과 함께 부른다
 */
// 내 정보(GET /members/me)는 기본 응답을 두지 않는다. 401을 주면 내 정보 쿼리가 비회원으로 바뀌어,
// 테스트가 캐시로 정한 로그인 상태가 풀린다.
const appShellDefaults = [
  http.get('*/api/v1/lectures', () =>
    HttpResponse.json({
      statusCode: 200,
      message: '',
      data: {
        content: [],
        page: { size: 12, number: 0, totalElements: 0, totalPages: 0 },
      },
    }),
  ),
  http.get('*/api/v1/chats', () =>
    HttpResponse.json({ statusCode: 200, message: '', data: [] }),
  ),
  // 내 출연 화면의 성립한 출연 목록
  http.get('*/api/v1/appearances', () =>
    HttpResponse.json({
      statusCode: 200,
      message: '',
      data: {
        content: [],
        page: { size: 10, number: 0, totalElements: 0, totalPages: 0 },
      },
    }),
  ),
]

/** 장바구니: 회원 상단 헤더의 배지를 위해 항상 부른다. */
const appShellCartDefault = [
  http.get('*/api/v1/lectures/cart', () =>
    HttpResponse.json({
      statusCode: 200,
      message: '',
      data: { items: [], purchasableTotalHp: 0 },
    }),
  ),
]

/**
 * 지갑 화면의 거래 원장·지급 예정 수익: 지갑을 여는 테스트마다 부른다(수익은 인플루언서만).
 * 화면별 응답은 src/test/walletHistory.ts의 mockTransactions·mockEarnings로 덮어쓴다.
 */
const walletHistoryDefaults = [
  ...['*/api/v1/wallets/me/transactions', '*/api/v1/settlements/earnings'].map(
    (path) =>
      http.get(path, () =>
        HttpResponse.json({
          statusCode: 200,
          message: '',
          data: {
            content: [],
            page: { size: 20, number: 0, totalElements: 0, totalPages: 0 },
          },
        }),
      ),
  ),
  http.get('*/api/v1/settlements/earnings/summary', () => {
    const none = { amountHp: 0, count: 0 }
    return HttpResponse.json({
      statusCode: 200,
      message: '',
      data: {
        confirmationPending: none,
        scheduled: none,
        onHold: none,
        processing: none,
        failed: none,
        total: none,
        asOf: '2026-10-19T00:00:00Z',
      },
    })
  }),
]

/** 관리자 첫 화면(/admin, 운영 대시보드)의 대기 건수: 관리자를 첫 화면으로 보낼 때 부른다. */
const adminHomeDefaults = [
  '*/api/v1/members/admin/channels',
  '*/api/v1/members/admin/upgrade-requests',
  '*/api/v1/lectures/admin/inspections',
  '*/api/v1/inquiries/admin',
  '*/api/v1/lectures/admin/payout-failures',
  '*/api/v1/settlements/admin/exchanges',
].map((path) =>
  http.get(path, () =>
    HttpResponse.json({
      statusCode: 200,
      message: '',
      data: {
        content: [],
        page: { size: 10, number: 0, totalElements: 0, totalPages: 0 },
      },
    }),
  ),
)

/** 테스트용 MSW 서버. 테스트마다 server.use(...)로 응답을 정한다. */
export const server = setupServer(
  ...appShellCartDefault,
  ...appShellDefaults,
  ...adminHomeDefaults,
  ...walletHistoryDefaults,
)
