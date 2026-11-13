import { screen, within } from '@testing-library/react'

/** 상단 헤더의 채팅 아이콘. 배지는 읽지 않으므로 안 읽은 메시지 수는 링크 이름(`채팅, 안 읽은 메시지 n개`)으로 본다. */
export const headerChatLink = () =>
  within(screen.getByRole('banner')).getByRole('link', { name: /^채팅/ })
