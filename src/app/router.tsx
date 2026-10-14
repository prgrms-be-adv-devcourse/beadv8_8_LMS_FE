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
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'

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
  { path: '/library/orders', title: '주문 내역', roles: MEMBER },
  { path: '/library/orders/:orderId/done', title: '주문 완료', roles: MEMBER },
  { path: '/library/:lectureId/watch', title: '강의 시청', roles: MEMBER },
  { path: '/library/:lectureId/review', title: '리뷰 작성', roles: MEMBER },
  { path: '/chat/:chatRoomId', title: '채팅', roles: [...INFLUENCER, 'ADMIN'] },
  { path: '/wallet/charge/result', title: '충전 결과', roles: MEMBER },
  { path: '/wallet/account', title: '환전 계좌', roles: INFLUENCER },
  { path: '/studio/new', title: '강의 등록', roles: ['VERIFIED_INFLUENCER'] },
  {
    path: '/studio/:lectureId/edit',
    title: '강의 수정',
    roles: ['VERIFIED_INFLUENCER'],
  },
  { path: '/support/inquiries/:inquiryId', title: '문의 상세', roles: MEMBER },
  { path: '/settings/withdraw', title: '회원 탈퇴', roles: MEMBER },
  { path: '/admin/lectures/:lectureId', title: '강의 검수', roles: ADMIN },
  { path: '/admin/disputes/:disputeId', title: '이의 제기 판정', roles: ADMIN },
  { path: '/admin/members/:memberId', title: '회원 상세', roles: ADMIN },
  { path: '/admin/deals/:dealId', title: '거래 상세', roles: ADMIN },
]

const PAGES: PageDef[] = [
  ...NAV.flatMap((g) => g.items).map(({ path, label, roles }) => ({
    path,
    title: label,
    roles,
  })),
  ...EXTRA_ROUTES,
]

/** 화면을 만들면 path별로 element를 바꿔 끼운다. 그 전까지는 자리표시 화면이다. */
function toRoute({ path, title, roles }: PageDef): RouteObject {
  if (path === '/') {
    // 홈은 비회원·관리자를 각자 첫 화면으로 보내야 해서 권한 검사를 HomePage가 한다.
    return {
      index: true,
      element: <HomePage />,
      handle: { title } satisfies RouteHandle,
    }
  }
  return {
    path: path.slice(1),
    element: <PlaceholderPage />,
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
