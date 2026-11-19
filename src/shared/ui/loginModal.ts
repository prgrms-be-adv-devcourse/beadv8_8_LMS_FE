import { create } from 'zustand'
import { safeReturnPath } from '@/shared/lib/returnPath'

/** 구글 로그인에서 돌아온 탈퇴 회원에게 물을 복구 (/login?error=WITHDRAWN_RESTORABLE) */
export type GoogleRestore = {
  /** 복구할 수 있는 마지막 시각(LocalDateTime, KST). 없으면 null */
  restorableUntil: string | null
  /** 복구한 뒤 구글 로그인을 마치고 돌아갈 경로(로그인 전에 보던 화면). 없으면 null */
  returnTo: string | null
}

type LoginModalState = {
  open: boolean
  reason?: string
  restore?: GoogleRestore
  /** 로그인한 뒤 갈 곳(비회원이 누른 강의 상세 등). 없으면 지금 화면에 머문다 */
  returnTo?: string
}

export const useLoginModalStore = create<LoginModalState>(() => ({
  open: false,
}))

/**
 * 비회원이 회원 기능을 쓰려 할 때 로그인 모달을 연다.
 * returnTo: 로그인한 뒤 갈 곳. 같은 출처의 앱 경로만 받고, 아니면 지금 화면에 머문다.
 */
export function openLoginModal(reason?: string, returnTo?: string) {
  useLoginModalStore.setState({
    open: true,
    reason,
    restore: undefined,
    returnTo: safeReturnPath(returnTo) ?? undefined,
  })
}

/** 구글 로그인에서 돌아온 탈퇴 회원에게 복구할지 묻는 로그인 모달을 연다. */
export function openRestorePrompt(restore: GoogleRestore) {
  useLoginModalStore.setState({
    open: true,
    reason: undefined,
    restore,
    returnTo: undefined,
  })
}

export function closeLoginModal() {
  useLoginModalStore.setState({
    open: false,
    reason: undefined,
    restore: undefined,
    returnTo: undefined,
  })
}
