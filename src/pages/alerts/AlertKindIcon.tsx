/**
 * 알림 종류 아이콘(장식). 문구는 서버 message를 그대로 쓰고, 여기서는 kind의 묶음만 보고 그림을 고른다.
 * BE가 새 kind를 더할 수 있으므로 모르는 값은 중립(종) 아이콘이다.
 */
type KindGroup =
  | 'MONEY'
  | 'APPEARANCE'
  | 'LECTURE'
  | 'INQUIRY'
  | 'CHAT'
  | 'INFLUENCER'
  | 'OTHER'

/** kind 앞부분으로 묶는다(BE notification-catalog의 이름 규칙) */
function groupOf(kind: string): KindGroup {
  if (/^(CHARGE|REFUND|EXCHANGE|PAYOUT)_/.test(kind)) return 'MONEY'
  if (kind.startsWith('APPEARANCE_')) return 'APPEARANCE'
  if (kind.startsWith('LECTURE_')) return 'LECTURE'
  if (kind.startsWith('INQUIRY_')) return 'INQUIRY'
  if (/^(GROUP|CHAT)_/.test(kind)) return 'CHAT'
  if (kind.startsWith('INFLUENCER_')) return 'INFLUENCER'
  return 'OTHER'
}

function pathOf(group: KindGroup): string {
  switch (group) {
    case 'MONEY':
      // 동전
      return 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4M12 7.5v1.5M12 15.5V17'
    case 'APPEARANCE':
      // 마이크
      return 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3'
    case 'LECTURE':
      // 재생 화면
      return 'M3 5h18v12H3zM10 8.5v5l4-2.5zM8 21h8'
    case 'INQUIRY':
      // 말풍선 물음표
      return 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM10 9.5a2 2 0 1 1 2.5 1.9c-.3.1-.5.4-.5.7v.4M12 15h.01'
    case 'CHAT':
      // 말풍선 둘
      return 'M14 9a4 4 0 0 1 4 4v5l-2.5-1.5H11a4 4 0 0 1-4-4M3 6.5a3.5 3.5 0 0 1 3.5-3.5h5A3.5 3.5 0 0 1 15 6.5v1A3.5 3.5 0 0 1 11.5 11H6l-3 2z'
    case 'INFLUENCER':
      // 인증 방패
      return 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6zM9 12l2 2 4-4'
    default:
      // 종
      return 'M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2.2 2.2 0 0 0 4 0'
  }
}

export function AlertKindIcon({ kind }: { kind: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={pathOf(groupOf(kind))} />
    </svg>
  )
}
