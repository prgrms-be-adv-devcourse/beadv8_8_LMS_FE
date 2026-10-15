import type { MyLecture } from '../types'

const LABEL = {
  ON_SALE: ['ok', '판매 중'],
  PENDING_INSPECTION: ['warn', '검수 대기'],
  REJECTED: ['bad', '반려'],
  DELETED: ['mute', '삭제됨'],
} as const

/** 판매자가 보는 강의 상태. 삭제했으면 검수 상태보다 삭제됨이 우선한다. */
export function MyLectureStatusPill({
  lecture,
}: {
  lecture: Pick<MyLecture, 'status' | 'deleted'>
}) {
  const [tone, label] = LABEL[lecture.deleted ? 'DELETED' : lecture.status]
  return <span className={`pill ${tone}`}>{label}</span>
}
