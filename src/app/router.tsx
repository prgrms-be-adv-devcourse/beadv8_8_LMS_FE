import type { ComponentType } from 'react'
import {
  redirect,
  type LoaderFunctionArgs,
  type RouteObject,
} from 'react-router'
import { AppShell } from '@/app/layouts/AppShell'
import { NAV } from '@/app/nav'
import { queryClient } from '@/app/queryClient'
import type { RouteHandle } from '@/app/routeHandle'
import { meQuery } from '@/shared/auth/me'
import {
  ADMIN,
  ALL,
  INFLUENCER,
  MEMBER,
  SIGNED_IN,
  type Viewer,
} from '@/shared/auth/role'
import { consumeReturnTo } from '@/shared/auth/session'
import { getAccessToken, refreshAccessToken } from '@/shared/auth/token'
import { NotFoundPage } from '@/app/fallbacks/NotFoundPage'
import { PlaceholderPage } from '@/app/fallbacks/PlaceholderPage'
import { reloadOnChunkError } from '@/app/fallbacks/chunkLoad'
import { RouteErrorPage } from '@/app/fallbacks/RouteErrorPage'
import { HomePage } from '@/pages/home/HomePage'

// /api, /swagger-ui, /v3/api-docs로 시작하는 경로는 BE로 가므로 쓰지 않는다(docs/deploy.md).

type PageDef = { path: string; title: string; roles: readonly Viewer[] }
type PageModule = { Component: ComponentType }

/** 내비 레일에 없는 화면: 상단 헤더로 들어가는 화면과 상세·하위 화면 (docs/mockup-ui.html의 EXTRA_ROUTES) */
const EXTRA_ROUTES: PageDef[] = [
  { path: '/', title: '홈', roles: ALL },
  { path: '/cart', title: '장바구니', roles: MEMBER },
  { path: '/alerts', title: '알림', roles: MEMBER },
  { path: '/lectures/:lectureId', title: '강의 상세', roles: SIGNED_IN },
  { path: '/recruits/:recruitId', title: '모집 상세', roles: SIGNED_IN },
  {
    path: '/influencers/:memberId',
    title: '인플루언서 프로필',
    roles: SIGNED_IN,
  },
  // 치지직 연동 콜백 뒤 BE가 보내는 경로(BE ApiV1MemberChannelController.RESULT_PATH)
  { path: '/mypage', title: '치지직 연동 결과', roles: MEMBER },
  // 구글 로그인 실패 때 BE가 보내는 주소(/login?error=)
  { path: '/login', title: '로그인', roles: ALL },
  {
    path: '/appearances/requests/:requestId',
    title: '출연 요청서',
    roles: INFLUENCER,
  },
  { path: '/appearances/:appearanceId', title: '출연 상세', roles: INFLUENCER },
  { path: '/library/orders', title: '주문 내역', roles: MEMBER },
  { path: '/library/orders/:orderId/done', title: '주문 완료', roles: MEMBER },
  { path: '/library/:lectureId/watch', title: '강의 시청', roles: MEMBER },
  { path: '/library/:lectureId/review', title: '리뷰 작성', roles: MEMBER },
  { path: '/chat', title: '채팅', roles: [...INFLUENCER, 'ADMIN'] },
  { path: '/chat/:chatRoomId', title: '채팅', roles: [...INFLUENCER, 'ADMIN'] },
  { path: '/wallet', title: '지갑', roles: MEMBER },
  { path: '/wallet/charge/result', title: '충전 결과', roles: MEMBER },
  { path: '/wallet/exchange', title: '환전 신청', roles: INFLUENCER },
  {
    path: '/studio/lectures/new',
    title: '강의 등록',
    roles: ['VERIFIED_INFLUENCER'],
  },
  {
    path: '/studio/lectures/:lectureId/edit',
    title: '강의 수정',
    roles: ['VERIFIED_INFLUENCER'],
  },
  { path: '/support/inquiries/:inquiryId', title: '문의 상세', roles: MEMBER },
  { path: '/settings/withdraw', title: '회원 탈퇴', roles: MEMBER },
  { path: '/admin/lectures/:lectureId', title: '강의 검수', roles: ADMIN },
  { path: '/admin/chats/:chatRoomId', title: '채팅 기록', roles: ADMIN },
  { path: '/admin/inquiries/:inquiryId', title: '문의 답변', roles: ADMIN },
  { path: '/admin/exchanges/:exchangeId', title: '환전 승인', roles: ADMIN },
  { path: '/admin/hp-tasks/:taskId', title: '강의 HP 작업', roles: ADMIN },
  {
    path: '/studio/coupons/:couponId',
    title: '쿠폰 신청',
    roles: ['VERIFIED_INFLUENCER'],
  },
  { path: '/admin/coupons/:couponId', title: '쿠폰 운영', roles: ADMIN },
]

const PAGES: PageDef[] = [
  ...NAV.flatMap((g) => g.items).map(({ path, label, roles, routeRoles }) => ({
    path,
    title: label,
    roles: routeRoles ?? roles,
  })),
  ...EXTRA_ROUTES,
]

/**
 * 만든 화면. 여기 없는 경로는 자리표시 화면이다.
 * 화면마다 따로 불러온다(첫 파일에는 앱 셸·홈·공통 모듈만 남는다). 처음 열 때는 rootLoader와 함께 기다리고, 화면을 옮길 때는
 * 그 화면 파일을 받을 때까지 이전 화면을 둔 채 앱 셸 맨 위에 진행 막대를 보인다(AppShell main의 aria-busy).
 */
export const PAGE_LOADERS: Record<string, () => Promise<PageModule>> = {
  '/lectures': () =>
    import('@/pages/lectures/LecturesPage').then((m) => ({
      Component: m.LecturesPage,
    })),
  '/lectures/:lectureId': () =>
    import('@/pages/lecture-detail/LectureDetailPage').then((m) => ({
      Component: m.LectureDetailPage,
    })),
  '/cart': () =>
    import('@/pages/cart/CartPage').then((m) => ({ Component: m.CartPage })),
  '/alerts': () =>
    import('@/pages/alerts/AlertsPage').then((m) => ({
      Component: m.AlertsPage,
    })),
  '/library': () =>
    import('@/pages/library/LibraryPage').then((m) => ({
      Component: m.LibraryPage,
    })),
  '/library/orders': () =>
    import('@/pages/orders/OrdersPage').then((m) => ({
      Component: m.OrdersPage,
    })),
  '/library/orders/:orderId/done': () =>
    import('@/pages/order-done/OrderDonePage').then((m) => ({
      Component: m.OrderDonePage,
    })),
  '/library/:lectureId/watch': () =>
    import('@/pages/watch/WatchPage').then((m) => ({ Component: m.WatchPage })),
  '/library/:lectureId/review': () =>
    import('@/pages/review-write/ReviewWritePage').then((m) => ({
      Component: m.ReviewWritePage,
    })),
  '/influencers': () =>
    import('@/pages/influencers/InfluencersPage').then((m) => ({
      Component: m.InfluencersPage,
    })),
  '/influencers/:memberId': () =>
    import('@/pages/influencer-profile/InfluencerProfilePage').then((m) => ({
      Component: m.InfluencerProfilePage,
    })),
  '/verify': () =>
    import('@/pages/verify/VerifyPage').then((m) => ({
      Component: m.VerifyPage,
    })),
  '/mypage': () =>
    import('@/pages/chzzk-result/ChzzkResultPage').then((m) => ({
      Component: m.ChzzkResultPage,
    })),
  '/login': () =>
    import('@/pages/login/LoginFailurePage').then((m) => ({
      Component: m.LoginFailurePage,
    })),
  '/settings': () =>
    import('@/pages/settings/SettingsPage').then((m) => ({
      Component: m.SettingsPage,
    })),
  '/settings/withdraw': () =>
    import('@/pages/settings-withdraw/WithdrawPage').then((m) => ({
      Component: m.WithdrawPage,
    })),
  '/profile/edit': () =>
    import('@/pages/my-profile/MyProfilePage').then((m) => ({
      Component: m.MyProfilePage,
    })),
  '/promote': () =>
    import('@/pages/promote/PromotePage').then((m) => ({
      Component: m.PromotePage,
    })),
  '/appearances': () =>
    import('@/pages/appearances/AppearancesPage').then((m) => ({
      Component: m.AppearancesPage,
    })),
  '/recruits': () =>
    import('@/pages/recruits/RecruitsPage').then((m) => ({
      Component: m.RecruitsPage,
    })),
  '/recruits/:recruitId': () =>
    import('@/pages/recruit-detail/RecruitDetailPage').then((m) => ({
      Component: m.RecruitDetailPage,
    })),
  '/chat': () =>
    import('@/pages/chat/ChatPage').then((m) => ({ Component: m.ChatPage })),
  '/chat/:chatRoomId': () =>
    import('@/pages/chat/ChatPage').then((m) => ({ Component: m.ChatPage })),
  '/appearances/requests/:requestId': () =>
    import('@/pages/appearance-request/AppearanceRequestPage').then((m) => ({
      Component: m.AppearanceRequestPage,
    })),
  '/appearances/:appearanceId': () =>
    import('@/pages/appearance-detail/AppearanceDetailPage').then((m) => ({
      Component: m.AppearanceDetailPage,
    })),
  '/studio': () =>
    import('@/pages/studio/StudioPage').then((m) => ({
      Component: m.StudioPage,
    })),
  '/studio/lectures/new': () =>
    import('@/pages/lecture-new/LectureNewPage').then((m) => ({
      Component: m.LectureNewPage,
    })),
  '/studio/lectures/:lectureId/edit': () =>
    import('@/pages/lecture-edit/LectureEditPage').then((m) => ({
      Component: m.LectureEditPage,
    })),
  '/admin': () =>
    import('@/pages/admin-dashboard/AdminDashboardPage').then((m) => ({
      Component: m.AdminDashboardPage,
    })),
  '/admin/chats': () =>
    import('@/pages/admin-chat-history/AdminChatHistoryPage').then((m) => ({
      Component: m.AdminChatHistoryPage,
    })),
  '/admin/chats/:chatRoomId': () =>
    import('@/pages/admin-chat-history/AdminChatHistoryPage').then((m) => ({
      Component: m.AdminChatHistoryPage,
    })),
  '/support': () =>
    import('@/pages/support/SupportPage').then((m) => ({
      Component: m.SupportPage,
    })),
  '/support/faq': () =>
    import('@/pages/support-faq/SupportFaqPage').then((m) => ({
      Component: m.SupportFaqPage,
    })),
  '/support/inquiries/:inquiryId': () =>
    import('@/pages/inquiry/InquiryPage').then((m) => ({
      Component: m.InquiryPage,
    })),
  '/admin/lectures': () =>
    import('@/pages/admin-lectures/AdminLecturesPage').then((m) => ({
      Component: m.AdminLecturesPage,
    })),
  '/admin/channels': () =>
    import('@/pages/admin-channels/AdminChannelsPage').then((m) => ({
      Component: m.AdminChannelsPage,
    })),
  '/admin/hp-tasks': () =>
    import('@/pages/admin-hp-tasks/AdminHpTasksPage').then((m) => ({
      Component: m.AdminHpTasksPage,
    })),
  '/admin/hp-tasks/:taskId': () =>
    import('@/pages/admin-hp-task/AdminHpTaskPage').then((m) => ({
      Component: m.AdminHpTaskPage,
    })),
  '/admin/appearance-hp-tasks': () =>
    import('@/pages/admin-appearance-hp-tasks/AdminAppearanceHpTasksPage').then(
      (m) => ({ Component: m.AdminAppearanceHpTasksPage }),
    ),
  '/admin/hp-reconciliations': () =>
    import('@/pages/admin-hp-reconciliations/AdminHpReconciliationsPage').then(
      (m) => ({ Component: m.AdminHpReconciliationsPage }),
    ),
  '/admin/exchanges': () =>
    import('@/pages/admin-exchanges/AdminExchangesPage').then((m) => ({
      Component: m.AdminExchangesPage,
    })),
  '/admin/exchanges/:exchangeId': () =>
    import('@/pages/admin-exchange/AdminExchangePage').then((m) => ({
      Component: m.AdminExchangePage,
    })),
  '/admin/exchange-payouts': () =>
    import('@/pages/admin-exchange-payouts/AdminExchangePayoutsPage').then(
      (m) => ({ Component: m.AdminExchangePayoutsPage }),
    ),
  '/admin/platform-wallet': () =>
    import('@/pages/admin-platform-wallet/AdminPlatformWalletPage').then(
      (m) => ({ Component: m.AdminPlatformWalletPage }),
    ),
  '/admin/promotion-wallet': () =>
    import('@/pages/admin-promotion-wallet/AdminPromotionWalletPage').then(
      (m) => ({ Component: m.AdminPromotionWalletPage }),
    ),
  '/admin/promotions': () =>
    import('@/pages/admin-promotions/AdminPromotionsPage').then((m) => ({
      Component: m.AdminPromotionsPage,
    })),
  '/admin/coupons': () =>
    import('@/pages/admin-coupons/AdminCouponsPage').then((m) => ({
      Component: m.AdminCouponsPage,
    })),
  '/admin/coupons/:couponId': () =>
    import('@/pages/admin-coupons/AdminCouponsPage').then((m) => ({
      Component: m.AdminCouponsPage,
    })),
  '/library/coupons': () =>
    import('@/pages/coupons/CouponsPage').then((m) => ({
      Component: m.CouponsPage,
    })),
  '/studio/coupons': () =>
    import('@/pages/studio-coupons/StudioCouponsPage').then((m) => ({
      Component: m.StudioCouponsPage,
    })),
  '/studio/coupons/:couponId': () =>
    import('@/pages/studio-coupons/StudioCouponsPage').then((m) => ({
      Component: m.StudioCouponsPage,
    })),
  '/admin/lectures/:lectureId': () =>
    import('@/pages/admin-lecture/AdminLecturePage').then((m) => ({
      Component: m.AdminLecturePage,
    })),
  '/admin/inquiries': () =>
    import('@/pages/admin-inquiries/AdminInquiriesPage').then((m) => ({
      Component: m.AdminInquiriesPage,
    })),
  '/admin/inquiries/:inquiryId': () =>
    import('@/pages/admin-inquiry/AdminInquiryPage').then((m) => ({
      Component: m.AdminInquiryPage,
    })),
  '/wallet': () =>
    import('@/pages/wallet/WalletPage').then((m) => ({
      Component: m.WalletPage,
    })),
  '/wallet/charge/result': () =>
    import('@/pages/charge-result/ChargeResultPage').then((m) => ({
      Component: m.ChargeResultPage,
    })),
  '/wallet/exchange': () =>
    import('@/pages/wallet-exchange/ExchangeRequestPage').then((m) => ({
      Component: m.ExchangeRequestPage,
    })),
}

/** 화면 경로 → 불러 둔 화면. 테스트는 모든 화면을 미리 불러 넘긴다(화면 이동 직후 바로 확인하는 테스트가 그대로 돈다). */
export type LoadedPages = Record<string, ComponentType>

/** 모든 화면을 불러 둔다(테스트용). */
export async function loadAllPages(): Promise<LoadedPages> {
  const entries = await Promise.all(
    Object.entries(PAGE_LOADERS).map(
      async ([path, load]) => [path, (await load()).Component] as const,
    ),
  )
  return Object.fromEntries(entries)
}

function toRoute(
  { path, title, roles }: PageDef,
  loaded?: LoadedPages,
): RouteObject {
  if (path === '/') {
    // 홈은 모든 역할 공통 첫 화면이다(비회원 포함).
    return {
      index: true,
      element: <HomePage />,
      handle: { title, roles, layout: 'top' } satisfies RouteHandle,
    }
  }
  const Loaded = loaded?.[path]
  const load = PAGE_LOADERS[path]
  return {
    path: path.slice(1),
    ...(Loaded
      ? { Component: Loaded }
      : load
        ? { lazy: reloadOnChunkError(load) }
        : { element: <PlaceholderPage /> }),
    handle: { title, roles } satisfies RouteHandle,
  }
}

/**
 * 첫 화면을 그리기 전에 로그인 상태를 확인한다(역할별 메뉴·가드가 깜빡이지 않게).
 * 처음 열 때(새로고침·구글 로그인·치지직·결제 복귀 포함)는 메모리에 access token이 없으므로 refresh token 쿠키로
 * 먼저 받고, 받으면 내 정보를 부른다. 받지 못하면(쿠키 없음·만료) 비회원이다.
 * 이미 로그인 상태를 정했으면(로그인·로그아웃 뒤 화면 이동) 다시 받지 않는다.
 * BE가 응답하지 않아도 비회원으로 보고 앱은 연다.
 */
async function rootLoader({ request }: LoaderFunctionArgs) {
  const decided = queryClient.getQueryData(meQuery.queryKey) !== undefined
  if (!decided && !getAccessToken()) {
    const token = await refreshAccessToken().catch(() => null)
    if (!token) queryClient.setQueryData(meQuery.queryKey, null)
  }
  const me = await queryClient.ensureQueryData(meQuery).catch(() => null)
  // 구글 로그인 실패 화면(/login)은 저장한 돌아갈 경로를 쓰지 않고 첫 화면으로 보낸다(LoginFailurePage가 버린다).
  if (me && new URL(request.url).pathname !== '/login') {
    const returnTo = consumeReturnTo()
    if (returnTo) throw redirect(returnTo)
  }
  return null
}

/**
 * loaded를 넘기면 그 화면은 따로 불러오지 않고 바로 쓴다.
 * 오류 화면은 두 겹이다. 화면이 그리다 실패하거나 화면 파일을 못 받으면 앱 셸 안(경로 없는 자식 라우트)에서 보여
 * 헤더·메뉴가 남는다. 맨 바깥은 rootLoader·앱 셸이 실패했을 때다.
 */
export function createRoutes(loaded?: LoadedPages): RouteObject[] {
  return [
    {
      path: '/',
      loader: rootLoader,
      element: <AppShell />,
      errorElement: <RouteErrorPage />,
      children: [
        {
          errorElement: <RouteErrorPage />,
          children: [
            ...PAGES.map((page) => toRoute(page, loaded)),
            { path: '*', element: <NotFoundPage /> },
          ],
        },
      ],
    },
  ]
}

export const routes = createRoutes()
