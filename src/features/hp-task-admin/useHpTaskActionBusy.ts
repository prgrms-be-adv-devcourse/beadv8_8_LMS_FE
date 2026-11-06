import { useIsMutating } from '@tanstack/react-query'
import { hpTaskKeys } from '@/entities/hp-task/api'

/**
 * 이 작업의 관리자 처리(재시도·보류 무효화)가 진행 중인지. 화면 상태가 아니라 mutation 캐시로 본다. 모달을 닫았다 열거나
 * 다른 메뉴로 갔다 돌아와도 이전 요청이 끝날 때까지 어느 쪽도 다시 보내지 못한다.
 */
export function useHpTaskActionBusy(taskId: number) {
  return useIsMutating({ mutationKey: hpTaskKeys.action(taskId) }) > 0
}
