import { useEffect } from 'react'
import { useBlocker } from 'react-router'
import { Modal } from '@/shared/ui/Modal'

/**
 * 올리는 중인 파일이 있으면 화면을 떠나기 전에 묻는다.
 * 앱 안 이동은 확인 창으로, 새로고침·탭 닫기는 브라우저 경고(beforeunload)로 막는다.
 * 나가면 폼이 사라지면서 업로드가 취소된다(useUploads).
 */
export function UploadLeaveGuard({ active }: { active: boolean }) {
  const blocker = useBlocker(active)

  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])

  if (blocker.state !== 'blocked') return null
  return (
    <Modal
      title="화면을 떠날까요?"
      onClose={() => blocker.reset()}
      footer={
        <>
          <button
            type="button"
            className="btn ghost"
            onClick={() => blocker.reset()}
          >
            머무르기
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => blocker.proceed()}
          >
            나가기
          </button>
        </>
      }
    >
      <p>올리는 중인 파일이 있어요. 나가면 업로드가 취소돼요.</p>
    </Modal>
  )
}
