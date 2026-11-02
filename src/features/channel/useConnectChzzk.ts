import { useMutation } from '@tanstack/react-query'
import { authorizeChzzk } from '@/entities/member/api'
import { toast } from '@/shared/ui/toastStore'

/** 치지직 연동 시작: 연동 주소를 받아 그 화면(치지직 로그인·동의)으로 이동한다 */
export function useConnectChzzk() {
  return useMutation({
    mutationFn: authorizeChzzk,
    onSuccess: ({ authorizeUrl }) => location.assign(authorizeUrl),
    onError: (error) => toast(error.message),
  })
}
