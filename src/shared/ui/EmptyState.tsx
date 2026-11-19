import type { ReactNode } from 'react'

/** 빈 상태 그림. empty: 꺼진 탤리 램프의 모니터, error: 신호가 끊긴 안테나, search: 돋보기 */
export type EmptyArt = 'empty' | 'error' | 'search' | 'none'

type EmptyStateProps = {
  title: string
  children?: ReactNode
  action?: ReactNode
  /** 제목 위 그림. 기본은 empty, 그림 없이 쓰려면 none */
  art?: EmptyArt
  /**
   * 제목 단계. 기본은 굵은 글자(b)로 화면 머리(h1) 아래 한 구역으로 둔다.
   * 화면 머리 없이 빈 상태·오류만 그리는 화면(찾지 못한 상세 등)은 1로 올려 화면 제목이 되게 한다.
   */
  headingLevel?: 1 | 2 | 'b'
  /** 나타날 때 바로 읽어야 하면(첫 조회 실패) alert */
  role?: 'alert'
}

export function EmptyState({
  title,
  children,
  action,
  art = 'empty',
  headingLevel = 'b',
  role,
}: EmptyStateProps) {
  return (
    <div className="panel empty-state" role={role}>
      {art !== 'none' && <EmptyIllustration art={art} />}
      {headingLevel === 1 ? (
        <h1>{title}</h1>
      ) : headingLevel === 2 ? (
        <h2>{title}</h2>
      ) : (
        <b>{title}</b>
      )}
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

/** 장식 그림. 선은 currentColor(.empty-art 색), 면은 global.css의 .face·.lamp가 토큰 색으로 칠한다 */
function EmptyIllustration({ art }: { art: Exclude<EmptyArt, 'none'> }) {
  return (
    <svg
      className="empty-art"
      viewBox="0 0 88 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {art === 'empty' && (
        <>
          <circle className="lamp" cx="44" cy="7" r="4" />
          <path d="M44 11v3" />
          <rect className="face" x="14" y="14" width="60" height="36" rx="6" />
          <path d="M30 32h6M41 32h6M52 32h6" />
          <path d="M44 50v6M33 58h22" />
        </>
      )}
      {art === 'error' && (
        <>
          <circle className="lamp" cx="44" cy="22" r="4" />
          <path d="M44 26v32M36 58l8-24 8 24M39 50h10" />
          <path d="M35 13a14 14 0 0 0 0 18M53 13a14 14 0 0 1 0 18" />
          <path
            d="M27 6a24 24 0 0 0 0 32M61 6a24 24 0 0 1 0 32"
            strokeDasharray="5 6"
          />
        </>
      )}
      {art === 'search' && (
        <>
          <circle className="face" cx="38" cy="28" r="16" />
          <path d="M31 28h14" strokeDasharray="3 4" />
          <path d="M50 40l12 12" strokeWidth="4" />
          <circle className="lamp" cx="66" cy="12" r="3" />
        </>
      )}
    </svg>
  )
}
