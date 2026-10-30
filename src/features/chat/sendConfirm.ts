import type { QueryClient } from '@tanstack/react-query'
import { CHAT_PAGE_SIZE, chatKeys } from '@/entities/chat/api'
import type {
  ChatMessage,
  ChatMessagePage,
  ChatRoom,
} from '@/entities/chat/types'
import { api } from '@/shared/api/client'
import {
  isAwaitingResult,
  markUnconfirmed,
  resolvePendingByIds,
  setSendWatcher,
  settleSend,
  useChatStore,
} from './chatStore'
import { mergeIntoHistory } from './incoming'
import { RECEIPT_POLICY } from './receipt/policy'

/** 결과 확인에서 이어 읽는 최신 이력 페이지 상한 */
const LOOKUP_MAX_PAGES = 2

/** 응답이 없을 때 이력에서도 찾지 못한 경우 */
const NOT_FOUND_REASON =
  '서버 응답이 없고 대화 기록에서도 찾지 못했어요. 다시 보내도 두 번 보내지지 않아요.'
/** 이력 확인 요청이 실패한 경우 */
const LOOKUP_FAILED_REASON =
  '서버 응답이 없고 대화 기록도 불러오지 못했어요. 다시 보내도 두 번 보내지지 않아요.'

/** 찾은 메시지와 그 이력 응답의 참여 세대(전환 전 서버는 없음) */
export type FoundMessage = {
  message: ChatMessage
  participationVersion?: number
}

/**
 * 최신 이력 몇 페이지에서 내 임시 ID의 메시지를 찾는다. 없으면 null.
 * 이력의 clientMessageId는 내 메시지에만 담기므로 임시 ID만 비교하면 된다.
 */
async function findInHistory(
  chatRoomId: number,
  clientMessageId: string,
  signal?: AbortSignal,
  onGeneration?: (version: number) => void,
): Promise<FoundMessage | null> {
  let cursor: number | undefined
  for (let i = 0; i < LOOKUP_MAX_PAGES; i++) {
    const page = await api<ChatMessagePage>(`/chats/${chatRoomId}/messages`, {
      query: { size: CHAT_PAGE_SIZE, cursor },
      signal,
    })
    // 찾았는지와 관계없이 응답의 참여 세대를 알린다(재입장으로 옛 메시지가 가시 범위에서 사라진 경우).
    if (page.participationVersion !== undefined)
      onGeneration?.(page.participationVersion)
    const found = page.messages.find(
      (m) => m.clientMessageId === clientMessageId,
    )
    if (found)
      return { message: found, participationVersion: page.participationVersion }
    if (page.nextCursor === null) return null
    cursor = page.nextCursor
  }
  return null
}

/** 방 목록 캐시의 이 방 내 참여 세대(활성 참여일 때만) */
function myVersion(queryClient: QueryClient, chatRoomId: number) {
  const { myUserId } = useChatStore.getState()
  const me = queryClient
    .getQueryData<ChatRoom[]>(chatKeys.rooms())
    ?.find((r) => r.chatRoomId === chatRoomId)
    ?.members.find((m) => m.userId === myUserId)
  return me?.active ? me.participationVersion : undefined
}

/**
 * 보내고 서버 결과를 기다리는 중인지. 다시 보내기가 자리를 기다리는 동안(아직 보내지 않음)은 이전 전송의 확인이
 * 결과 미확인으로 바꾸지 않는다(보내면 처음부터 다시 기다린다).
 */
function isSending(chatRoomId: number, clientMessageId: string) {
  return (
    useChatStore
      .getState()
      .pending[chatRoomId]?.find((p) => p.clientMessageId === clientMessageId)
      ?.status === 'sending' && isAwaitingResult(clientMessageId)
  )
}

/**
 * 보낸 메시지의 전송 결과를 확인한다(BE final-design 4.4: 송신 응답 확인 시간 초과).
 * 보낸 뒤 timeoutMs 안에 서버 응답(같은 clientMessageId)이 없으면 최신 이력에서 내 임시 ID를 찾는다.
 * - 찾으면 저장된 것이므로 찾은 메시지를 그 방 이력 캐시에 합친 뒤(중복 제거) 보내는 중 표시를 지운다.
 *   화면이 최신 한 페이지만 들고 있어도 메시지가 사라지지 않는다
 * - 못 찾거나 확인하지 못하면 실패로 단정하지 않고 결과 미확인으로 바꿔, 같은 임시 ID로 다시 보내게 한다
 *   (서버는 같은 임시 ID 재전송에 새로 저장하지 않고 기존 메시지를 돌려준다)
 * 보낼 때마다 메시지별로 기다리고, 같은 메시지를 다시 보내면 처음부터 다시 기다린다.
 * 채팅 연결이 있는 동안 등록하고, 돌려준 함수로 해제하고 기다리던 확인을 모두 버린다.
 */
export function installSendConfirm(
  queryClient: QueryClient,
  options: {
    timeoutMs?: number
    lookup?: (
      chatRoomId: number,
      clientMessageId: string,
      signal?: AbortSignal,
    ) => Promise<FoundMessage | null>
    /**
     * 이 탭이 아는 방의 참여 세대. 채팅 연결은 방 목록·이력·실시간에서 관측한 가장 높은 세대를 넘긴다
     * (방 목록 갱신이 늦어도 이미 버린 옛 세대 결과를 받아들이지 않게). 없으면 방 목록의 내 세대
     */
    generationOf?: (chatRoomId: number) => number | undefined
    /** 이력 응답에서 본 참여 세대를 채팅 연결에 알린다(더 높으면 이전 세대 상태를 버린다) */
    noticeGeneration?: (chatRoomId: number, version: number) => void
  } = {},
) {
  const {
    timeoutMs = RECEIPT_POLICY.send.confirmTimeoutMs,
    lookup,
    generationOf = (chatRoomId: number) => myVersion(queryClient, chatRoomId),
    noticeGeneration,
  } = options
  const find =
    lookup ??
    ((chatRoomId: number, clientMessageId: string, signal?: AbortSignal) =>
      findInHistory(chatRoomId, clientMessageId, signal, (version) =>
        noticeGeneration?.(chatRoomId, version),
      ))
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  /** 진행 중인 이력 확인(해제할 때 끊는다) */
  const running = new Set<AbortController>()
  // 메시지별 확인 세대. 확인하는 동안 다시 보냈으면 이전 확인 결과를 버린다.
  const generations = new Map<string, number>()
  let lastGeneration = 0
  let disposed = false

  const confirm = async (
    chatRoomId: number,
    clientMessageId: string,
    generation: number,
  ) => {
    const stale = () =>
      disposed || generations.get(clientMessageId) !== generation
    // 확인이 끝났다. 그사이 다시 보내지 않았으면 다음 전송에 자리를 넘긴다.
    const finish = () => {
      if (stale()) return
      generations.delete(clientMessageId)
      settleSend(clientMessageId)
    }
    // 확인을 시작한 때의 참여 세대. 그사이 나가기·재입장으로 세대가 바뀌었으면 찾은 메시지를 새 세대 이력에 넣지 않는다.
    const version = generationOf(chatRoomId)
    // 확인 요청이 실패하면 failed
    let found: FoundMessage | null = null
    let failed = false
    // 이력 확인도 시간 상한을 둔다. 응답이 끝나지 않으면 확인하지 못한 것으로 보고 결과 미확인으로 바꾼다.
    const run = new AbortController()
    running.add(run)
    const timer = setTimeout(() => run.abort(), timeoutMs)
    try {
      found = await Promise.race([
        find(chatRoomId, clientMessageId, run.signal),
        new Promise<never>((_, reject) =>
          run.signal.addEventListener(
            'abort',
            () => reject(run.signal.reason),
            {
              once: true,
            },
          ),
        ),
      ])
    } catch {
      failed = true
    } finally {
      clearTimeout(timer)
      running.delete(run)
    }
    if (disposed) return
    if (found?.participationVersion !== undefined)
      noticeGeneration?.(chatRoomId, found.participationVersion)
    const sameGeneration =
      found !== null &&
      generationOf(chatRoomId) === version &&
      (found.participationVersion === undefined ||
        version === undefined ||
        found.participationVersion === version)
    if (found && !sameGeneration) {
      // 세대가 바뀐 사이의 결과는 버린다. 이전 세대의 보내는 중 표시는 세대 바뀜 처리가 이미 버렸다.
      finish()
      return
    }
    if (found) {
      // 찾은 메시지를 이력에 먼저 합쳐야 보내는 중 표시를 지워도 메시지가 사라지지 않는다. 이력을 아직 불러오지 못했으면
      // 보내는 중 표시를 그대로 둔다(나중에 이력을 불러오면 저장된 내 메시지로 정리된다).
      // 열지 않은 방의 이력 캐시는 실시간으로 이어지지 않아 하나만 합치면 사이가 빈다(다시 열 때 읽음 처리가 빈 구간을
      // 읽은 것으로 볼 수 있다). 합치지 않고 표시만 지운다(열 때 이력을 다시 불러온다).
      const open = useChatStore.getState().viewingRoomId === chatRoomId
      if (!open || mergeIntoHistory(queryClient, chatRoomId, [found.message]))
        resolvePendingByIds(chatRoomId, new Set([clientMessageId]))
    } else {
      if (stale() || !isSending(chatRoomId, clientMessageId)) return
      markUnconfirmed(
        clientMessageId,
        failed ? LOOKUP_FAILED_REASON : NOT_FOUND_REASON,
      )
    }
    finish()
  }

  const watch = (chatRoomId: number, clientMessageId: string) => {
    clearTimeout(timers.get(clientMessageId))
    const generation = ++lastGeneration
    generations.set(clientMessageId, generation)
    timers.set(
      clientMessageId,
      setTimeout(() => {
        timers.delete(clientMessageId)
        // 그사이 서버 응답·오류·연결 끊김으로 정리됐으면 확인하지 않는다.
        if (!isSending(chatRoomId, clientMessageId)) {
          generations.delete(clientMessageId)
          return
        }
        void confirm(chatRoomId, clientMessageId, generation)
      }, timeoutMs),
    )
  }

  setSendWatcher(watch)
  return () => {
    disposed = true
    setSendWatcher(null)
    for (const run of running) run.abort()
    running.clear()
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    generations.clear()
  }
}
