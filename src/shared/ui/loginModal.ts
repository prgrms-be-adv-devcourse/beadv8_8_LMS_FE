import { create } from 'zustand'

type LoginModalState = { open: boolean; reason?: string }

export const useLoginModalStore = create<LoginModalState>(() => ({
  open: false,
}))

/** 비회원이 회원 기능을 쓰려 할 때 로그인 모달을 연다. */
export function openLoginModal(reason?: string) {
  useLoginModalStore.setState({ open: true, reason })
}

export function closeLoginModal() {
  useLoginModalStore.setState({ open: false, reason: undefined })
}
