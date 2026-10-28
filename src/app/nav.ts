import {
  ADMIN,
  ALL,
  INFLUENCER,
  MEMBER,
  SIGNED_IN,
  type Viewer,
} from '@/shared/auth/role'

export type NavItem = {
  path: string
  label: string
  /** 메뉴를 보여 줄 역할 */
  roles: Viewer[]
  /** 화면에 들어올 수 있는 역할이 메뉴와 다를 때만 */
  routeRoles?: Viewer[]
}
export type NavGroup = { title: string; items: NavItem[] }

/** 좁은 화면에서 상단 헤더의 장바구니를 대신 보여 줄 그룹 */
export const MY_ACTIVITY = '내 활동'

/**
 * 왼쪽 내비 레일 (docs/mockup-ui.html의 NAV). 역할에 맞는 항목만 보인다. 라우트 권한도 여기서 가져간다.
 * 홈은 로고로, 장바구니는 상단 헤더로 들어가므로 여기 두지 않는다(라우트는 router.tsx EXTRA_ROUTES).
 * 알림·검색·이의 제기·회원·거래 조회·처리 이력은 BE API가 없어 메뉴와 라우트를 두지 않는다(#101).
 */
export const NAV: NavGroup[] = [
  {
    title: '운영',
    items: [
      { path: '/admin', label: '대시보드', roles: ADMIN },
      { path: '/admin/channels', label: '채널 인증 심사', roles: ADMIN },
      { path: '/admin/promotions', label: '승급 심사', roles: ADMIN },
      { path: '/admin/lectures', label: '강의 검수', roles: ADMIN },
      { path: '/admin/payouts', label: '지급 실패', roles: ADMIN },
      { path: '/admin/exchanges', label: '환전 승인', roles: ADMIN },
      { path: '/admin/inquiries', label: '문의 답변', roles: ADMIN },
      { path: '/admin/chats', label: '채팅 기록', roles: ADMIN },
    ],
  },
  {
    title: '둘러보기',
    items: [
      { path: '/lectures', label: '강의', roles: ALL },
      { path: '/recruits', label: '출연 모집', roles: SIGNED_IN },
      { path: '/influencers', label: '인플루언서', roles: SIGNED_IN },
    ],
  },
  {
    title: MY_ACTIVITY,
    items: [
      { path: '/appearances', label: '내 출연', roles: INFLUENCER },
      { path: '/library', label: '내 강의', roles: MEMBER },
      { path: '/chat', label: '채팅', roles: [...INFLUENCER, 'ADMIN'] },
      { path: '/wallet', label: '지갑', roles: MEMBER },
      { path: '/profile/edit', label: '내 프로필', roles: INFLUENCER },
    ],
  },
  {
    title: '판매·인증',
    items: [
      { path: '/studio', label: '강의 판매', roles: ['VERIFIED_INFLUENCER'] },
      {
        path: '/verify',
        label: '채널 인증',
        roles: ['USER'],
        // 승인되면 그 자리에서 인플루언서가 되므로, 인플루언서도 완료 안내를 볼 수 있게 한다.
        routeRoles: MEMBER,
      },
      {
        path: '/promote',
        label: '승급 신청',
        roles: ['INFLUENCER'],
        // 승인되면 그 자리에서 인증된 인플루언서가 되므로, 완료 안내를 볼 수 있게 한다.
        routeRoles: INFLUENCER,
      },
    ],
  },
  {
    title: '지원',
    items: [
      { path: '/support', label: '고객센터', roles: MEMBER },
      {
        path: '/settings',
        label: '계정 설정',
        roles: MEMBER,
        // 관리자는 운영 레일에 두지 않고 상단 프로필 메뉴로만 들어온다.
        routeRoles: SIGNED_IN,
      },
    ],
  },
]

export function navFor(viewer: Viewer): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((it) => it.roles.includes(viewer)),
  })).filter((g) => g.items.length > 0)
}
