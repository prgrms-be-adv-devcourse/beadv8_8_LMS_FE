import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { meQuery } from '@/shared/auth/me'
import { ChatbotLauncher } from './ChatbotLauncher'
import { ChatbotWindow } from './ChatbotWindow'
import { endSession, startSession, useChatbotStore } from './store'

/**
 * 앱 셸에 붙는 챗봇: 오른쪽 아래 버튼과 그 위에 뜨는 채팅창.
 * 대화의 주인은 로그인 회원이다. 회원이 정해지면 이 탭에 저장한 대화를 되살리고(새로고침),
 * 비회원이 되면(로그아웃·다른 탭 로그아웃·로그인 만료) 대화와 저장값을 지운다. 계정을 바꾸면 이전 대화를 버린다.
 */
export function ChatbotRoot() {
  const { data: me, isPending } = useQuery(meQuery)
  const memberId = me?.id ?? null
  const open = useChatbotStore((s) => s.open)

  useEffect(() => {
    if (isPending) return
    if (memberId === null) endSession()
    else startSession(memberId)
  }, [isPending, memberId])

  // 내 정보를 불러오는 중에는 비회원 안내를 잘못 띄우지 않게 버튼을 그리지 않는다.
  if (isPending) return null
  const signedIn = memberId !== null
  return (
    <>
      {open && signedIn && <ChatbotWindow />}
      <ChatbotLauncher signedIn={signedIn} open={open && signedIn} />
    </>
  )
}
