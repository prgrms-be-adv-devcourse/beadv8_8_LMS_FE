import { formatDday } from '@/shared/lib/date'
import { isDeadlineSoon } from '../recruit'
import type { Recruit, RecruitSummary } from '../types'

/**
 * 목록 카드의 상태. 모집 중이면 마감까지 남은 날(3일 이하면 signal),
 * 그 밖에는 마감·취소 상태를 보여 준다.
 */
export function RecruitDeadlinePill({ recruit }: { recruit: RecruitSummary }) {
  if (recruit.status !== 'RECRUITING')
    return <RecruitStatusPill recruit={recruit} />
  const dday = formatDday(recruit.recruitDeadline)
  return isDeadlineSoon(recruit.recruitDeadline) ? (
    <span className="pill signal">마감 {dday}</span>
  ) : (
    <span className="pill line">{dday}</span>
  )
}

/** 상세 머리글의 상태. 마감이면 조기 마감·기한 마감을 나눈다 */
export function RecruitStatusPill({
  recruit,
}: {
  recruit: RecruitSummary & Partial<Pick<Recruit, 'closeType'>>
}) {
  const [tone, label] = labelOf(recruit)
  return <span className={`pill ${tone}`}>{label}</span>
}

function labelOf(
  recruit: RecruitSummary & Partial<Pick<Recruit, 'closeType'>>,
): [string, string] {
  switch (recruit.status) {
    case 'RECRUITING':
      return ['warn', `모집 중 · ${formatDday(recruit.recruitDeadline)}`]
    case 'CLOSED':
      return [
        'mute',
        recruit.closeType === 'EARLY'
          ? '조기 마감'
          : recruit.closeType === 'DEADLINE'
            ? '기한 마감'
            : '마감',
      ]
    case 'CANCELED':
      return ['mute', '취소됨']
    case 'HOLD_PENDING':
      return ['warn', 'HP 보류 처리 중']
    case 'HOLD_FAILED':
      return ['bad', 'HP 보류 실패']
  }
}
