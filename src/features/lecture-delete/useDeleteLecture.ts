import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteLecture, lectureKeys } from '@/entities/lecture/api'
import { toast } from '@/shared/ui/toastStore'

/** 삭제한 강의는 공개 목록·상세에서도 내려가므로 강의 쿼리를 모두 다시 불러온다. */
export function useDeleteLecture() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteLecture,
    onError: (error) => toast(error.message),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: lectureKeys.all }),
  })
}
