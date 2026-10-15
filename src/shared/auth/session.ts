import {
  hashKey,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { toast } from '@/shared/ui/toastStore'
import { logout, meQuery } from './me'
import type { Viewer } from './role'

const GOOGLE_LOGIN_URL = '/api/v1/members/oauth2/authorization/google'
const RETURN_TO_KEY = 'hapbang.returnTo'

/** 현재 사용자의 역할. 내 정보를 불러오는 중이면 undefined */
export function useViewer(): Viewer | undefined {
  const { data, isPending } = useQuery(meQuery)
  if (isPending) return undefined
  return data?.role ?? 'GUEST'
}

/**
 * 구글 로그인으로 이동한다. BE가 원래 페이지로 돌려보내지 않으므로(requestCache 꺼짐)
 * 돌아올 경로를 저장해 두고 앱 시작 시 consumeReturnTo()로 꺼낸다.
 */
export function startGoogleLogin(
  returnTo = location.pathname + location.search,
) {
  try {
    sessionStorage.setItem(RETURN_TO_KEY, returnTo)
  } catch {
    // 저장소를 못 쓰면 로그인 후 첫 화면으로 간다.
  }
  location.assign(GOOGLE_LOGIN_URL)
}

/** 로그인 전에 저장한 경로를 한 번만 꺼낸다. 같은 출처 경로만 허용한다. */
export function consumeReturnTo(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_TO_KEY)
    sessionStorage.removeItem(RETURN_TO_KEY)
    return path && path.startsWith('/') && !path.startsWith('//') ? path : null
  } catch {
    return null
  }
}

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return async () => {
    try {
      await logout()
    } catch {
      toast('로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.')
      return
    }
    clearSession(queryClient)
    broadcastLogout()
    navigate('/')
  }
}

/**
 * 비회원으로 바꾸고(채팅 연결도 닫힌다) 다른 회원의 데이터가 남지 않도록 나머지 캐시를 지운다.
 * 내 정보까지 clear()로 지우면 화면이 구독하던 쿼리가 끊겨, 다시 그려지기 전까지 로그인 화면이 남는다.
 */
function clearSession(queryClient: QueryClient) {
  queryClient.setQueryData(meQuery.queryKey, null)
  queryClient.removeQueries({
    predicate: (query) => query.queryHash !== hashKey(meQuery.queryKey),
  })
}

// ── 탭 간 로그아웃 동기화 ──
// 세션 쿠키는 탭이 함께 쓰므로 한 탭에서 로그아웃하면 다른 탭도 비회원이다. 알리지 않으면 다른 탭은
// 다음 API 호출(401) 전까지 로그인 화면과 채팅 연결을 그대로 둔다.

const AUTH_CHANNEL = 'hapbang.auth'
type AuthMessage = { type: 'logout' }

/**
 * 이 탭이 듣고 있는 채널. 보낼 때도 같은 객체를 쓴다.
 * BroadcastChannel은 보낸 객체에만 전달하지 않으므로 같은 탭의 다른 객체로 보내면 자기 자신도 받는다.
 */
let listening: BroadcastChannel | null = null

function broadcastLogout() {
  if (typeof BroadcastChannel === 'undefined') return
  const message: AuthMessage = { type: 'logout' }
  if (listening) {
    listening.postMessage(message)
    return
  }
  const channel = new BroadcastChannel(AUTH_CHANNEL)
  channel.postMessage(message)
  channel.close()
}

/** 다른 탭에서 로그아웃하면 이 탭도 캐시를 비우고 비회원으로 바꾼다. 앱 셸에서 한 번 쓴다. */
export function useLogoutSync() {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(AUTH_CHANNEL)
    channel.onmessage = (e: MessageEvent<AuthMessage>) => {
      if (e.data?.type !== 'logout') return
      clearSession(queryClient)
      toast('다른 탭에서 로그아웃했어요.')
    }
    listening = channel
    return () => {
      channel.close()
      if (listening === channel) listening = null
    }
  }, [queryClient])
}
