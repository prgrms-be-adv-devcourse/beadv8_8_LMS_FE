import { create } from 'zustand'

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
}

export const useLoginModalStore = create<LoginModalState>(() => ({
  open: false,
}))

/** 비회원이 회원 기능을 쓰려 할 때 로그인 모달을 연다. */
export function openLoginModal(reason?: string) {
  useLoginModalStore.setState({ open: true, reason, restore: undefined })
}

/** 구글 로그인에서 돌아온 탈퇴 회원에게 복구할지 묻는 로그인 모달을 연다. */
export function openRestorePrompt(restore: GoogleRestore) {
  useLoginModalStore.setState({ open: true, reason: undefined, restore })
}

export function closeLoginModal() {
  useLoginModalStore.setState({
    open: false,
    reason: undefined,
    restore: undefined,
  })
}
