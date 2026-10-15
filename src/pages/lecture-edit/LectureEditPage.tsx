import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { lectureQuery } from '@/entities/lecture/api'
import type { LectureContent, LectureDetail } from '@/entities/lecture/types'
import { MyLectureStatusPill } from '@/entities/lecture/ui/MyLectureStatusPill'
import { LectureEditorForm } from '@/features/lecture-editor/LectureEditorForm'
import { useSaveLecture } from '@/features/lecture-editor/useSaveLecture'
import { ContentPreviewModal } from '@/features/lecture-preview/ContentPreviewModal'
import { meQuery } from '@/shared/auth/me'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'

/**
 * 강의 수정. 기본 정보는 상태와 관계없이 바로 반영되고, 영상·자료는 반려된 강의만 고쳐 재검수를 신청한다.
 * 삭제한 강의와 내 강의가 아닌 강의는 안내만 보여 준다(남의 강의는 파일 ID가 null로 와서 저장하면 썸네일이 지워진다).
 */
export function LectureEditPage() {
  const lectureId = Number(useParams().lectureId)
  const {
    data: lecture,
    error,
    isPending,
    refetch,
  } = useQuery(lectureQuery(lectureId))
  const { data: me } = useQuery(meQuery)

  return (
    <div className="page">
      <Link className="back" to="/studio">
        ← 강의 판매
      </Link>
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : lecture.deleted ? (
        <EmptyState title="삭제한 강의는 수정할 수 없어요" action={toStudio}>
          <MyLectureStatusPill lecture={lecture} /> <b>{lecture.title}</b>
          <br />
          기존 구매자는 계속 볼 수 있어요. 다시 판매하려면 새로 등록해 주세요.
        </EmptyState>
      ) : me && lecture.sellerUserId !== me.id ? (
        <EmptyState title="내 강의만 수정할 수 있어요" action={toStudio} />
      ) : (
        <Editor key={lecture.lectureId} lecture={lecture} />
      )}
    </div>
  )
}

const toStudio = (
  <Link className="btn" to="/studio">
    강의 판매로
  </Link>
)

function Editor({ lecture }: { lecture: LectureDetail }) {
  const save = useSaveLecture(lecture)
  const [preview, setPreview] = useState<LectureContent | null>(null)
  return (
    <>
      <PageHead title="강의 수정" lede={lecture.title} />
      {lecture.status === 'REJECTED' && lecture.rejectionReason && (
        <div className="notice warn">
          <b>반려 사유</b> {lecture.rejectionReason}
        </div>
      )}
      <LectureEditorForm
        lecture={lecture}
        onSubmit={save.mutateAsync}
        onPreview={setPreview}
      />
      {preview && (
        <ContentPreviewModal
          lectureId={lecture.lectureId}
          content={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  )
}
