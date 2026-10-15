import type { MyLecture } from '@/entities/lecture/types'
import { Modal } from '@/shared/ui/Modal'
import { toast } from '@/shared/ui/toastStore'
import { useDeleteLecture } from './useDeleteLecture'

type DeleteLectureModalProps = {
  lecture: Pick<MyLecture, 'lectureId' | 'title'>
  onClose: () => void
}

export function DeleteLectureModal({
  lecture,
  onClose,
}: DeleteLectureModalProps) {
  const remove = useDeleteLecture()
  return (
    <Modal
      title="강의를 삭제할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(lecture.lectureId, {
                onSuccess: () => {
                  onClose()
                  toast('강의를 삭제했어요. 목록에서 내려갔어요.')
                },
              })
            }
          >
            삭제
          </button>
        </>
      }
    >
      <p>
        <b>{lecture.title}</b>
      </p>
      <p>
        목록 노출과 신규 판매만 멈추고, 기존 구매자는 계속 볼 수 있어요. 지급은
        예정대로 진행돼요.
      </p>
    </Modal>
  )
}
