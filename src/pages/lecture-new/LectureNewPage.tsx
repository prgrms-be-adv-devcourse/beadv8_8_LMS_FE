import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { createLecture, lectureKeys } from '@/entities/lecture/api'
import {
  LectureEditorForm,
  type LectureEditorValue,
} from '@/features/lecture-editor/LectureEditorForm'
import { PageHead } from '@/shared/ui/PageHead'
import { toast } from '@/shared/ui/toastStore'

/** 강의 등록. 등록한 강의는 검수 대기(비공개)로 시작하고, 관리자가 승인하면 공개된다. */
export function LectureNewPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: ({ info, contents }: LectureEditorValue) =>
      createLecture({ ...info, contents }),
    onSuccess: () => {
      // 내 강의 목록은 페이지마다 캐시되므로 모든 페이지를 다시 불러온다.
      void queryClient.invalidateQueries({
        queryKey: [...lectureKeys.all, 'mine'],
      })
      toast('검수를 신청했어요. 승인되면 공개돼요.')
      navigate('/studio')
    },
  })

  return (
    <div className="page">
      <Link className="back" to="/studio">
        ← 강의 판매
      </Link>
      <PageHead
        title="강의 등록"
        lede="등록한 강의는 관리자 검수를 통과하면 공개되고 판매가 시작돼요."
      />
      <LectureEditorForm onSubmit={create.mutateAsync} />
    </div>
  )
}
