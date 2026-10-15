import { daysUntil, isPast } from '@/shared/lib/date'
import type { Application, Recruit } from './types'

/** 마감이 가까운 모집 (3일 이하). 목록에서 눈에 띄게 표시한다 */
export function isDeadlineSoon(recruitDeadline: string, now = new Date()) {
  return !isPast(recruitDeadline, now) && daysUntil(recruitDeadline, now) <= 3
}

/** 지원·수락·수정·조기 마감을 할 수 있는 모집 (모집 중이고 마감 일시 전) */
export function isRecruitOpen(recruit: Recruit, now = new Date()) {
  return (
    recruit.status === 'RECRUITING' && !isPast(recruit.recruitDeadline, now)
  )
}

/** 내 지원 목록에서 이 모집글에 한 지원. 한 모집글에 한 번만 지원할 수 있다 */
export function findMyApplication(
  applications: Application[],
  recruitId: number,
): Application | undefined {
  return applications.find((a) => a.recruitId === recruitId)
}
