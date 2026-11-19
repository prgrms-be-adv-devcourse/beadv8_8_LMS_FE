import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/shared/ui/toastStore'
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
} from './api'

/**
 * 알림 하나 읽음. 부르는 쪽은 결과를 기다리지 않고 이동하므로 실패(404 포함)해도 안내하지 않는다.
 * 성공·실패 모두 목록과 안 읽은 수를 다시 읽는다(화면을 떠나도 훅 옵션의 콜백은 실행된다).
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markNotificationRead,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

/** 모두 읽음. 실패하면 안내하고, 끝나면 목록과 안 읽은 수를 다시 읽는다 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onError: (error) => toast(error.message, { tone: 'error' }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}
