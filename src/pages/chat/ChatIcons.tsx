import type { ReactNode } from 'react'

/** 채팅 화면의 선 아이콘. 글자(접근성 이름)는 옆의 글자나 aria-label이 맡고 아이콘은 꾸밈이다 */
function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const CloseIcon = () => (
  <Icon size={18}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

export const BackIcon = () => (
  <Icon size={20}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
)

export const SendIcon = () => (
  <Icon size={18}>
    <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" />
  </Icon>
)

export const InviteIcon = () => (
  <Icon>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M19 8v6M16 11h6" />
  </Icon>
)

export const LockIcon = () => (
  <Icon>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </Icon>
)

export const ExitIcon = () => (
  <Icon>
    <path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 16l-4-4 4-4M6 12h10" />
  </Icon>
)

export const UsersIcon = () => (
  <Icon size={14}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.6a3.5 3.5 0 010 6.8M18 14.8c2 .7 3.2 2.6 3.5 5.2" />
  </Icon>
)

export const InfoIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.5v.5" />
  </Icon>
)

export const AlertIcon = () => (
  <Icon size={14}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 16.5v.5" />
  </Icon>
)

/**
 * 빈 대화 그림: 탤리 램프가 켜진 스튜디오 모니터와 오가는 말풍선(꾸밈).
 * 색은 모듈 CSS의 클래스가 토큰으로 칠한다(다크 모드 자동)
 */
export function ChatArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="132"
      height="96"
      viewBox="0 0 132 96"
      aria-hidden="true"
      focusable="false"
    >
      <rect data-part="screen" x="22" y="14" width="88" height="58" rx="10" />
      <rect data-part="glass" x="30" y="22" width="72" height="42" rx="5" />
      <path data-part="stand" d="M58 72h16l4 12H54z" />
      <rect data-part="base" x="46" y="84" width="40" height="5" rx="2.5" />
      <circle data-part="lamp" cx="96" cy="14" r="7" />
      <path
        data-part="bubble-a"
        d="M38 32a5 5 0 015-5h22a5 5 0 015 5v8a5 5 0 01-5 5H50l-6 5v-5h-1a5 5 0 01-5-5z"
      />
      <path
        data-part="bubble-b"
        d="M94 44a5 5 0 00-5-5H70a5 5 0 00-5 5v6a5 5 0 005 5h12l6 4v-4h1a5 5 0 005-5z"
      />
      <path data-part="lines-a" d="M45 34h18M45 39h11" />
      <path data-part="lines-b" d="M71 46h12" />
    </svg>
  )
}
