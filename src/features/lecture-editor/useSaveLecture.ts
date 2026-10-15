import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import {
  lectureKeys,
  replaceLectureContents,
  requestInspection,
  updateLectureInfo,
} from '@/entities/lecture/api'
import { canEditContents } from '@/entities/lecture/edit'
import type { LectureDetail } from '@/entities/lecture/types'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'
import type { LectureEditorValue } from './LectureEditorForm'

/** 여러 단계로 저장하다 중간에 실패했을 때, 어디까지 반영됐는지 담은 안내 */
export class LectureSaveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LectureSaveError'
  }
}

const withPrefix = (prefix: string, error: unknown) =>
  new LectureSaveError(
    `${prefix} ${error instanceof Error ? error.message : ''}`.trim(),
  )

/**
 * 강의 수정 저장. 바뀐 것만 보낸다: 기본 정보(PATCH) → 콘텐츠(PUT, 반려만) → 재검수 신청(POST, 반려만).
 * 중간에 실패하면 상세를 다시 불러와 폼의 "바뀐 것"을 서버 상태에 맞추고, 어디까지 반영됐는지 알린다.
 * 성공하면 토스트를 띄우고 강의 판매(/studio)로 간다.
 */
export function useSaveLecture(lecture: LectureDetail) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const lectureId = lecture.lectureId
  const rejected = canEditContents(lecture)

  return useMutation({
    mutationFn: async ({ info, contents, changed }: LectureEditorValue) => {
      if (changed.info) {
        try {
          await updateLectureInfo(lectureId, info)
        } catch (error) {
          // 칸에 붙일 수 있는 오류(제목·가격)는 그대로 넘겨 폼이 칸 아래에 보여 준다.
          if (
            isApiError(error) &&
            (error.errors.length > 0 || error.code === 'INVALID_PRICE')
          )
            throw error
          throw withPrefix('저장하지 못했어요.', error)
        }
      }
      if (rejected && changed.contents) {
        try {
          await replaceLectureContents(lectureId, contents)
        } catch (error) {
          throw withPrefix(
            changed.info
              ? '기본 정보는 저장했지만 강의 내용은 저장하지 못했어요.'
              : '강의 내용을 저장하지 못했어요.',
            error,
          )
        }
      }
      if (rejected) {
        try {
          await requestInspection(lectureId)
        } catch (error) {
          throw withPrefix(
            changed.info || changed.contents
              ? '저장은 됐지만 재검수 신청이 안 됐어요. 다시 신청해 주세요.'
              : '재검수 신청이 안 됐어요. 다시 신청해 주세요.',
            error,
          )
        }
      }
    },
    onError: () =>
      queryClient.invalidateQueries({
        queryKey: lectureKeys.detail(lectureId),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: lectureKeys.detail(lectureId),
      })
      // 내 강의 목록은 페이지마다 캐시되므로 모든 페이지를 다시 불러온다.
      void queryClient.invalidateQueries({
        queryKey: [...lectureKeys.all, 'mine'],
      })
      toast(
        rejected
          ? '저장하고 재검수를 신청했어요.'
          : '저장했어요. 바로 반영돼요.',
      )
      navigate('/studio')
    },
  })
}
