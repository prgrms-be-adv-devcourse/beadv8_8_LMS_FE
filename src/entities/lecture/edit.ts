import type { LectureDetail, LectureStatus } from './types'

type EditableLecture = Pick<LectureDetail, 'status' | 'deleted'>

/** 영상·자료는 반려된 강의만 바꿀 수 있다(BE D11). 판매 중·검수 대기는 삭제 후 다시 등록해야 한다 */
export function canEditContents(lecture: EditableLecture): boolean {
  return !lecture.deleted && lecture.status === 'REJECTED'
}

/** 콘텐츠를 바꿀 수 없는 상태에서 강의 내용 영역에 보여 줄 안내 */
export function readOnlyContentsNotice(status: LectureStatus): string {
  return status === 'PENDING_INSPECTION'
    ? '검수 대기 중인 강의의 영상·자료는 바꿀 수 없어요. 검수 결과를 기다려 주세요.'
    : '판매 중인 강의의 영상·자료는 바꿀 수 없어요. 삭제한 뒤 다시 등록해 주세요.'
}

/** 수정 화면으로 가는 버튼 라벨. 반려된 강의는 고친 뒤 재검수를 신청한다 */
export function editLabel(status: LectureStatus): string {
  return status === 'REJECTED' ? '수정 후 재검수' : '수정'
}
