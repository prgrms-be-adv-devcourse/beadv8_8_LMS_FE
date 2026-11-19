/**
 * 앱 셸 아이콘. 24 viewBox, 선 1.5px, currentColor. 모두 장식이라 aria-hidden이고 글자를 넣지 않는다
 * (내비 링크의 읽는 이름·textContent가 메뉴 이름 그대로여야 한다).
 */
type IconProps = { d: string; size?: number; strokeWidth?: number }

export function Icon({ d, size = 18, strokeWidth = 1.5 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  )
}

const TICKET =
  'M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4zM14 6v12'

/** 내비 항목 경로 → 아이콘 모양. 없는 경로는 작은 점으로 그린다. */
const NAV_PATHS: Record<string, string> = {
  // 하단 탭바의 홈
  '/': 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  // 운영
  '/admin': 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  '/admin/channels':
    'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2 2 4-4',
  '/admin/promotions':
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 12.5 12 9l3.5 3.5M12 9v7',
  '/admin/lectures':
    'M9 4h6v3H9zM9 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15M9 14l2 2 4-4',
  '/admin/hp-tasks':
    'M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
  '/admin/appearance-hp-tasks':
    'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6',
  '/admin/hp-reconciliations':
    'M12 4v16M5 20h14M6 8h12M6 8l-3 6a3 3 0 0 0 6 0zM18 8l-3 6a3 3 0 0 0 6 0z',
  '/admin/exchanges': 'M4 8h14l-3-3M20 16H6l3 3',
  '/admin/exchange-payouts':
    'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  '/admin/platform-wallet':
    'M19 5 5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  '/admin/promotion-wallet':
    'M4 9h16v4H4zM5.5 13H18.5v7h-13zM12 9v11M12 9S10.5 4 8 5s.5 4 4 4zM12 9s1.5-5 4-4-.5 4-4 4z',
  '/admin/inquiries':
    'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4zM10 8.5a2 2 0 1 1 2.5 1.9c-.4.2-.5.5-.5.9M12 13.2h.01',
  '/admin/chats':
    'M15 9.5A1.5 1.5 0 0 0 13.5 8h-8A1.5 1.5 0 0 0 4 9.5v5A1.5 1.5 0 0 0 5.5 16H7v3l3.5-3h3a1.5 1.5 0 0 0 1.5-1.5zM9 8V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v5a1.5 1.5 0 0 1-1.5 1.5H15',
  '/admin/coupons': TICKET,
  // 둘러보기
  '/lectures':
    'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM10.5 9.5v5l4-2.5z',
  '/recruits': 'M4 10v4h3l7 4V6l-7 4zM17.5 9a4 4 0 0 1 0 6M7 14l1 5h2.5l-1-4.4',
  '/influencers':
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.5A6 6 0 0 1 21 20',
  // 내 활동
  '/appearances':
    'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4',
  '/library':
    'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6',
  '/library/coupons': TICKET,
  // 쿠폰 받기: 티켓 + 받는 화살표
  '/coupons': `${TICKET}M9 9v6M6.8 12.8 9 15l2.2-2.2`,
  '/profile/edit':
    'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  '/cart': 'M3 4h2.2l2.3 11h10.3L20 8H6.3M9.5 20h.01M16.5 20h.01',
  // 판매·인증
  '/studio':
    'M4 9.5 5.5 4h13L20 9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5 11.5V20h14v-8.5M10 20v-5h4v5',
  '/studio/coupons': TICKET,
  '/verify':
    'M12 3l2.3 1.6 2.8-.1.9 2.7 2.2 1.7-.9 2.7.9 2.7-2.2 1.7-.9 2.7-2.8-.1L12 21l-2.3-1.6-2.8.1-.9-2.7-2.2-1.7.9-2.7-.9-2.7 2.2-1.7.9-2.7 2.8.1zM9 12l2 2 4-4',
  '/promote': 'M4 17l5.5-5.5 3.5 3.5L20 8M14.5 8H20v5.5',
  // 계정 메뉴의 지갑
  '/wallet':
    'M4 7.5A1.5 1.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM4 9.5h16M15.5 14h.01',
  // 지원
  '/support/faq':
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1v.5M12 16.5h.01',
  '/support':
    'M4 13v-1a8 8 0 0 1 16 0v1M4 13a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2zM20 13a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2zM17 17c0 2-2 3-5 3',
  '/settings':
    'M4 7h10M18 7h2M4 17h4M12 17h8M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
}

/** 하단 탭바의 '마이'(계정 메뉴)·'로그인' */
export const ME_ICON =
  'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0'
export const LOGIN_ICON =
  'M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M14 8l4 4-4 4M18 12H9'

const DOT = 'M12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z'

export function NavIcon({ path }: { path: string }) {
  return <Icon d={NAV_PATHS[path] ?? DOT} />
}
