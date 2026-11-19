import { matchPath } from 'react-router'
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

/** 주요 메뉴 그룹. 비회원·회원은 상단 헤더 가로 메뉴와 좁은 화면 하단 탭바에 두고, 나머지 그룹은 계정 메뉴에 둔다. */
export const BROWSE = '둘러보기'

/**
 * 역할별 메뉴 (docs/mockup-ui.html의 NAV). 역할에 맞는 항목만 보인다. 라우트 권한도 여기서 가져간다.
 * 관리자는 모든 그룹을 왼쪽 내비 레일로 본다. 비회원·회원은 '둘러보기'를 상단 헤더(좁은 화면은 하단 탭바)에, 나머지 그룹을
 * 아바타의 계정 메뉴(좁은 화면은 하단 탭바 '마이')에 둔다.
 * 홈은 로고로, 장바구니·채팅·알림·지갑(HP 칸)은 상단 헤더로 들어가므로 여기 두지 않는다(라우트는 router.tsx EXTRA_ROUTES).
 * 검색·이의 제기·회원·거래 조회·처리 이력은 BE API가 없어 메뉴와 라우트를 두지 않는다(#101).
 */
export const NAV: NavGroup[] = [
  {
    title: '운영',
    items: [
      { path: '/admin', label: '대시보드', roles: ADMIN },
      { path: '/admin/channels', label: '채널 인증 심사', roles: ADMIN },
      { path: '/admin/promotions', label: '승급 심사', roles: ADMIN },
      { path: '/admin/lectures', label: '강의 검수', roles: ADMIN },
      { path: '/admin/hp-tasks', label: '강의 HP 작업', roles: ADMIN },
      {
        path: '/admin/appearance-hp-tasks',
        label: '출연 HP 작업',
        roles: ADMIN,
      },
      { path: '/admin/hp-reconciliations', label: 'HP 대사', roles: ADMIN },
      { path: '/admin/exchanges', label: '환전 승인', roles: ADMIN },
      { path: '/admin/exchange-payouts', label: '송금 확인', roles: ADMIN },
      { path: '/admin/platform-wallet', label: '수수료 수입', roles: ADMIN },
      { path: '/admin/promotion-wallet', label: '프로모션 지갑', roles: ADMIN },
      { path: '/admin/inquiries', label: '문의 답변', roles: ADMIN },
      { path: '/admin/chats', label: '채팅 기록', roles: ADMIN },
      { path: '/admin/coupons', label: '쿠폰 운영', roles: ADMIN },
    ],
  },
  {
    title: BROWSE,
    items: [
      { path: '/lectures', label: '강의', roles: ALL },
      { path: '/recruits', label: '출연 모집', roles: SIGNED_IN },
      { path: '/influencers', label: '인플루언서', roles: SIGNED_IN },
    ],
  },
  {
    title: '내 활동',
    items: [
      { path: '/appearances', label: '내 출연', roles: INFLUENCER },
      { path: '/library', label: '내 강의', roles: MEMBER },
      { path: '/library/coupons', label: '쿠폰함', roles: MEMBER },
      { path: '/coupons', label: '쿠폰 받기', roles: MEMBER },
      { path: '/profile/edit', label: '내 프로필', roles: INFLUENCER },
    ],
  },
  {
    title: '판매·인증',
    items: [
      { path: '/studio', label: '강의 판매', roles: ['VERIFIED_INFLUENCER'] },
      {
        path: '/studio/coupons',
        label: '쿠폰 신청',
        roles: ['VERIFIED_INFLUENCER'],
      },
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
      // 관리자도 레일에서 본다(FAQ API는 로그인 회원 전체). 관리자의 '지원' 그룹에는 이것만 있다.
      { path: '/support/faq', label: '자주 묻는 질문', roles: SIGNED_IN },
      { path: '/support', label: '고객센터', roles: MEMBER },
      {
        path: '/settings',
        label: '계정 설정',
        roles: MEMBER,
        // 관리자는 운영 레일에 두지 않고 상단 계정 메뉴로만 들어온다.
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

/** 주요 메뉴 항목(둘러보기 그룹): 상단 헤더 가로 메뉴와 좁은 화면 하단 탭바가 같이 쓴다. */
export function browseItems(viewer: Viewer): NavItem[] {
  return navFor(viewer).find((g) => g.title === BROWSE)?.items ?? []
}

const within = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`)

/**
 * 하위 경로에 따로 메뉴가 있고 지금 그 메뉴 안에 있으면 true(그 메뉴만 켜지게 한다).
 * 예: /library/coupons에서는 '쿠폰함'만 켜지고 '내 강의'(/library)는 꺼진다. /library/7/watch에서는 '내 강의'가 켜진다.
 */
export function shadowedByChild(
  path: string,
  pathname: string,
  paths: string[],
) {
  return paths.some(
    (other) => other !== path && within(other, path) && within(pathname, other),
  )
}

/**
 * 구역 탭: 한 구역의 목록 화면끼리 오가는 탭. 항목 경로와 똑같은 화면에서만 본문 맨 위에 보인다(상세·시청·주문 완료·강의 등록 제외).
 * 역할이 들어갈 수 있는 항목만 보이고, 남는 항목이 하나뿐이면 그리지 않는다. 관리자는 쓰지 않는다(왼쪽 레일).
 */
export type NavSection = { name: string; items: NavItem[] }

export const SECTIONS: NavSection[] = [
  {
    name: '내 강의',
    items: [
      { path: '/library', label: '내 강의', roles: MEMBER },
      { path: '/library/orders', label: '주문 내역', roles: MEMBER },
      { path: '/library/coupons', label: '쿠폰함', roles: MEMBER },
    ],
  },
  {
    name: '스튜디오',
    items: [
      { path: '/studio', label: '강의 판매', roles: ['VERIFIED_INFLUENCER'] },
      {
        path: '/studio/coupons',
        label: '쿠폰 신청',
        roles: ['VERIFIED_INFLUENCER'],
      },
    ],
  },
]

export function sectionFor(
  viewer: Viewer,
  pathname: string,
): NavSection | null {
  const section = SECTIONS.find((s) =>
    s.items.some((it) => it.path === pathname),
  )
  if (!section) return null
  const items = section.items.filter((it) => it.roles.includes(viewer))
  return items.length > 1 ? { ...section, items } : null
}

/** 하단 탭바를 숨기는 화면: 화면 자체에 아래 입력·행동 줄(메시지 입력, 강의 저장)이 있다. */
export const NO_TAB_BAR = [
  '/chat/:chatRoomId',
  '/studio/lectures/new',
  '/studio/lectures/:lectureId/edit',
]

export function hidesTabBar(pathname: string) {
  return NO_TAB_BAR.some((pattern) => matchPath(pattern, pathname))
}
