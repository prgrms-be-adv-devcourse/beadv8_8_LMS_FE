import type { ReactNode } from 'react'
import { createBrowserRouter, redirect, type RouteObject } from 'react-router'
import { AppShell } from '@/app/layouts/AppShell'
import { NAV } from '@/app/nav'
import { queryClient } from '@/app/queryClient'
import type { RouteHandle } from '@/app/routeHandle'
import { meQuery } from '@/shared/auth/me'
import {
  ADMIN,
  INFLUENCER,
  MEMBER,
  SIGNED_IN,
  type Viewer,
} from '@/shared/auth/role'
import { consumeReturnTo } from '@/shared/auth/session'
import { NotFoundPage } from '@/app/fallbacks/NotFoundPage'
import { PlaceholderPage } from '@/app/fallbacks/PlaceholderPage'
import { RouteErrorPage } from '@/app/fallbacks/RouteErrorPage'
import { AppearanceRequestPage } from '@/pages/appearance-request/AppearanceRequestPage'
import { AdminInquiriesPage } from '@/pages/admin-inquiries/AdminInquiriesPage'
import { AdminInquiryPage } from '@/pages/admin-inquiry/AdminInquiryPage'
import { AppearancesPage } from '@/pages/appearances/AppearancesPage'
import { CartPage } from '@/pages/cart/CartPage'
import { ChatPage } from '@/pages/chat/ChatPage'
import { ChzzkResultPage } from '@/pages/chzzk-result/ChzzkResultPage'
import { InfluencerProfilePage } from '@/pages/influencer-profile/InfluencerProfilePage'
import { InfluencersPage } from '@/pages/influencers/InfluencersPage'
import { InquiryPage } from '@/pages/inquiry/InquiryPage'
import { MyProfilePage } from '@/pages/my-profile/MyProfilePage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { StudioPage } from '@/pages/studio/StudioPage'
import { SupportPage } from '@/pages/support/SupportPage'
import { VerifyPage } from '@/pages/verify/VerifyPage'
import { HomePage } from '@/pages/home/HomePage'
import { LectureDetailPage } from '@/pages/lecture-detail/LectureDetailPage'
import { LecturesPage } from '@/pages/lectures/LecturesPage'
import { LectureNewPage } from '@/pages/lecture-new/LectureNewPage'
import { LibraryPage } from '@/pages/library/LibraryPage'
import { OrderDonePage } from '@/pages/order-done/OrderDonePage'
import { OrdersPage } from '@/pages/orders/OrdersPage'
import { ReviewWritePage } from '@/pages/review-write/ReviewWritePage'
import { WatchPage } from '@/pages/watch/WatchPage'

// /api, /swagger-ui, /v3/api-docs로 시작하는 경로는 BE로 가므로 쓰지 않는다(docs/deploy.md).

type PageDef = { path: string; title: string; roles: readonly Viewer[] }

/** 내비에 없는 상세·하위 화면 (docs/mockup-ui.html의 EXTRA_ROUTES) */
const EXTRA_ROUTES: PageDef[] = [
  { path: '/lectures/:lectureId', title: '강의 상세', roles: SIGNED_IN },
  { path: '/recruits/:recruitId', title: '모집 상세', roles: SIGNED_IN },
  {
    path: '/influencers/:memberId',
    title: '인플루언서 프로필',
    roles: SIGNED_IN,
  },
  { path: '/search', title: '검색', roles: ['GUEST', ...MEMBER] },
  // 치지직 연동 콜백 뒤 BE가 보내는 경로(BE ApiV1MemberChannelController.RESULT_PATH)
  { path: '/mypage', title: '치지직 연동 결과', roles: MEMBER },
  {
    path: '/appearances/requests/:requestId',
    title: '출연 요청서',
    roles: INFLUENCER,
  },
  { path: '/library/orders', title: '주문 내역', roles: MEMBER },
  { path: '/library/orders/:orderId/done', title: '주문 완료', roles: MEMBER },
  { path: '/library/:lectureId/watch', title: '강의 시청', roles: MEMBER },
  { path: '/library/:lectureId/review', title: '리뷰 작성', roles: MEMBER },
  { path: '/chat/:chatRoomId', title: '채팅', roles: [...INFLUENCER, 'ADMIN'] },
  { path: '/wallet/charge/result', title: '충전 결과', roles: MEMBER },
  { path: '/wallet/account', title: '환전 계좌', roles: INFLUENCER },
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
  { path: '/admin/inquiries/:inquiryId', title: '문의 답변', roles: ADMIN },
  { path: '/admin/disputes/:disputeId', title: '이의 제기 판정', roles: ADMIN },
  { path: '/admin/members/:memberId', title: '회원 상세', roles: ADMIN },
  { path: '/admin/deals/:dealId', title: '거래 상세', roles: ADMIN },
]

const PAGES: PageDef[] = [
  ...NAV.flatMap((g) => g.items).map(({ path, label, roles, routeRoles }) => ({
    path,
    title: label,
    roles: routeRoles ?? roles,
  })),
  ...EXTRA_ROUTES,
]

/** 만든 화면. 여기 없는 경로는 자리표시 화면이다. */
const PAGE_ELEMENTS: Record<string, ReactNode> = {
  '/lectures': <LecturesPage />,
  '/lectures/:lectureId': <LectureDetailPage />,
  '/cart': <CartPage />,
  '/library': <LibraryPage />,
  '/library/orders': <OrdersPage />,
  '/library/orders/:orderId/done': <OrderDonePage />,
  '/library/:lectureId/watch': <WatchPage />,
  '/library/:lectureId/review': <ReviewWritePage />,
  '/influencers': <InfluencersPage />,
  '/influencers/:memberId': <InfluencerProfilePage />,
  '/verify': <VerifyPage />,
  '/mypage': <ChzzkResultPage />,
  '/settings': <SettingsPage />,
  '/profile/edit': <MyProfilePage />,
  '/appearances': <AppearancesPage />,
  '/chat': <ChatPage />,
  '/chat/:chatRoomId': <ChatPage />,
  '/appearances/requests/:requestId': <AppearanceRequestPage />,
  '/studio': <StudioPage />,
  '/studio/lectures/new': <LectureNewPage />,
  '/support': <SupportPage />,
  '/support/inquiries/:inquiryId': <InquiryPage />,
  '/admin/inquiries': <AdminInquiriesPage />,
  '/admin/inquiries/:inquiryId': <AdminInquiryPage />,
}

function toRoute({ path, title, roles }: PageDef): RouteObject {
  if (path === '/') {
    // 홈은 모든 역할 공통 첫 화면이다(비회원 포함).
    return {
      index: true,
      element: <HomePage />,
      handle: { title, roles, layout: 'top' } satisfies RouteHandle,
    }
  }
  return {
    path: path.slice(1),
    element: PAGE_ELEMENTS[path] ?? <PlaceholderPage />,
    handle: { title, roles } satisfies RouteHandle,
  }
}

/**
 * 첫 화면을 그리기 전에 로그인 상태를 확인한다(역할별 메뉴·가드가 깜빡이지 않게).
 * BE가 응답하지 않아도 비회원으로 보고 앱은 연다.
 */
async function rootLoader() {
  const me = await queryClient.ensureQueryData(meQuery).catch(() => null)
  if (me) {
    const returnTo = consumeReturnTo()
    if (returnTo) throw redirect(returnTo)
  }
  return null
}

export const routes: RouteObject[] = [
  {
    path: '/',
    loader: rootLoader,
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [...PAGES.map(toRoute), { path: '*', element: <NotFoundPage /> }],
  },
]

export const router = createBrowserRouter(routes)
