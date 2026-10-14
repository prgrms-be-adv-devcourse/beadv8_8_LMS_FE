import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { localLogin, logout, meQuery } from '@/shared/auth/me'
import {
  homePathOf,
  VIEWER_LABEL,
  type Role,
  type Viewer,
} from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { toast } from '@/shared/ui/toastStore'
import styles from './AppShell.module.css'

const VIEWERS: Viewer[] = [
  'GUEST',
  'USER',
  'INFLUENCER',
  'VERIFIED_INFLUENCER',
  'ADMIN',
]

/**
 * 개발 서버 전용: 로컬 BE의 테스트 계정으로 역할을 바꿔 로그인한다(POST /members/local-login).
 * AppShell이 import.meta.env.DEV일 때만 그려서 운영 번들에서는 빠진다.
 */
export function DevRoleStrip() {
  const viewer = useViewer()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const switchTo = async (next: Viewer) => {
    try {
      if (next === 'GUEST') await logout()
      const me = next === 'GUEST' ? null : await localLogin(next as Role)
      queryClient.clear()
      queryClient.setQueryData(meQuery.queryKey, me)
      navigate(homePathOf(next))
    } catch {
      toast(
        '역할을 바꾸지 못했어요. 로컬 BE(8080)와 local-login 설정을 확인해 주세요.',
      )
    }
  }

  return (
    <div className={styles.proto}>
      <b>DEV 역할</b>
      <div className={styles.seg}>
        {VIEWERS.map((v) => (
          <button
            key={v}
            type="button"
            className={v === viewer ? styles.segOn : undefined}
            aria-pressed={v === viewer}
            onClick={() => switchTo(v)}
          >
            {VIEWER_LABEL[v]}
          </button>
        ))}
      </div>
    </div>
  )
}
