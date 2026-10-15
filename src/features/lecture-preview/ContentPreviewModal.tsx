import type { LectureContent } from '@/entities/lecture/types'
import { ContentView } from '@/features/lecture-watch/ContentView'
import { Modal } from '@/shared/ui/Modal'

type ContentPreviewModalProps = {
  lectureId: number
  content: LectureContent
  onClose: () => void
}

/** 판매자가 자기 강의의 강을 미리 본다. 시청 URL은 열 때마다 새로 받는다(1시간 만료, 50분 뒤 재발급). */
export function ContentPreviewModal({
  lectureId,
  content,
  onClose,
}: ContentPreviewModalProps) {
  return (
    <Modal
      title={`${String(content.sequence).padStart(2, '0')} ${content.title}`}
      onClose={onClose}
      wide
    >
      <ContentView lectureId={lectureId} content={content} />
    </Modal>
  )
}
