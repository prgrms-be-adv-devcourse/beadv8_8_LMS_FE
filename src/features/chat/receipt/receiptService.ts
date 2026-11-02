import {
  hashKey,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { CHAT_PAGE_SIZE, chatKeys } from '@/entities/chat/api'
import type {
  ChatMessage,
  ChatMessagePage,
  ChatRoom,
} from '@/entities/chat/types'
import { api } from '@/shared/api/client'
import { createAckQueue } from './ackQueue'
import type { AckTransport, DeliveryMeta } from './contract'
import { coverageOfPage, createReceiptLedger } from './coverage'
import { RECEIPT_POLICY } from './policy'
import { createReconcileScheduler } from './reconcileScheduler'
import { clearRoomPending } from '../chatStore'
import { discardArrivals, mergeIntoHistory } from '../incoming'
import { discardRoomState } from '../roomSync'

type MessagePages = InfiniteData<ChatMessagePage, number | null>

/** 신호가 취소되면 끝나는 Promise(결과 없이 끝낸다) */
function aborted(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) resolve()
    else signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

type Options = {
  queryClient: QueryClient
  userId: number
  transport: AckTransport
  /** 대조할 방(지금 열어 둔 방) */
  openRooms: () => number[]
  policy?: typeof RECEIPT_POLICY
}

/**
 * 이 기기(탭)의 수신 확인 위치·누적 ACK·마지막 유실 대조를 묶는다(BE final-design 4.4).
 * - 확인 위치는 회원·방·참여 세대별로 메모리에만 둔다. 메시지 원본(이력 캐시)도 메모리에만 있으므로, 새로고침으로
 *   잃으면 위치도 같이 잃고 가시 범위의 이력을 다시 읽어 맞춘다(서버 회원 커서를 복사하지 않는다)
 * - 이력 응답은 그 범위를 서버가 빠짐없이 돌려준 것이라 구간으로, 실시간 메시지는 한 점으로 기록하고
 *   처음(가시 범위 시작)부터 이어진 구간만 ACK한다
 * - 연결 중에도 마지막 메시지만 유실될 수 있어 방 목록·열어 둔 방 이력을 주기적으로 대조한다
 */
export function createReceiptService({
  queryClient,
  userId,
  transport,
  openRooms,
  policy = RECEIPT_POLICY,
}: Options) {
  const ledger = createReceiptLedger()
  /** 서비스가 끝났는지(로그아웃·회원 전환). 끝난 뒤 도착한 응답은 반영하지 않는다 */
  let disposed = false
  /** 끝날 때 진행 중인 대조 요청을 끊는다 */
  const lifetime = new AbortController()
  /**
   * 방별로 이 탭이 관측한 가장 높은 참여 세대(방 목록·이력 응답·실시간 프레임 중 어디서든).
   * 이보다 낮은 세대의 응답은 받지 않고, 오르면 이전 세대 상태를 버린다(observeGeneration).
   */
  const seenGeneration = new Map<number, number>()
  /** 방별 이력 캐시 수명. 캐시가 지워질 때마다 오른다(진행 중인 대조가 지워진 캐시의 스냅샷으로 기록하지 않게) */
  const cacheEpoch = new Map<number, number>()
  /**
   * 새 세대 최신 페이지를 받아 이력을 새 세대로 바꾸는 중인 방. 같은 조회의 이전 페이지가 실패하면 옛 세대 캐시가
   * 남으므로 버린다(성공하면 지운다)
   */
  const replacing = new Set<number>()
  /** 확인 위치를 기록한 방(세대가 바뀌거나 방 목록에서 빠지면 버린다) */
  const tracked = new Set<number>()
  /** 이력 응답이 알려 준 방별 가시 범위 시작(이보다 낮은 값은 ACK하지 않는다) */
  const visibleFrom = new Map<number, number>()
  /**
   * 방별로 서버가 거절(stale)한 마지막 ACK. 재동기화 뒤에도 같은 세대에서 그 값 이하를 다시 계산하면 보내지 않는다
   * (세대가 그대로인데 거절이 반복되면 재동기화·ACK가 끝없이 돌지 않게).
   */
  const rejected = new Map<number, { version: number; sequence: number }>()
  /** 방별로 마지막으로 대기열에 넣은 ACK */
  const lastOffered = new Map<number, { version: number; sequence: number }>()
  /** 방별 이력 캐시의 참여 세대(최신 페이지 기준) */
  const historyGeneration = new Map<number, number>()
  /** 재동기화 신호로 최신 페이지를 바로 다시 읽어야 하는 방(방금 받았어도 생략하지 않는다) */
  const forced = new Set<number>()
  /** 방별로 최신 페이지를 마지막으로 받은 시각 */
  const latestFetchedAt = new Map<number, number>()
  const acks = createAckQueue({
    transport,
    policy: policy.ack,
    // 옛 세대·참여 아님: 방 목록과 그 방 이력을 다시 맞춘다.
    onStale: (chatRoomId, generationChanged) => {
      const offered = lastOffered.get(chatRoomId)
      if (offered) rejected.set(chatRoomId, offered)
      ledger.discardRoom(chatRoomId)
      if (generationChanged) {
        // 세대가 맞지 않았다(옛 세대·참여 아님·방 없음). 재조회 성공 여부와 관계없이 이전 세대의 이력·도착 버퍼·
        // 보내는 중 표시를 먼저 버린다(재입장 뒤 서버가 옛 clientMessageId를 모르면 다시 보낸 것이 새로 저장될 수 있다).
        historyGeneration.delete(chatRoomId)
        discardArrivals(chatRoomId)
        discardRoomState(queryClient, chatRoomId)
      } else {
        void queryClient.invalidateQueries({
          queryKey: chatKeys.messages(chatRoomId),
        })
      }
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
    },
  })

  /** 방 목록 캐시에서 이 방의 내 참여 세대(활성 참여일 때만) */
  const myVersion = (chatRoomId: number) => {
    const me = queryClient
      .getQueryData<ChatRoom[]>(chatKeys.rooms())
      ?.find((r) => r.chatRoomId === chatRoomId)
      ?.members.find((m) => m.userId === userId)
    return me?.active ? me.participationVersion : undefined
  }

  /**
   * 이 탭이 아는 가장 높은 세대: 방 목록의 내 세대와, 새 세대 프레임을 보고 방 목록을 다시 받는 중인 목표 세대 중 큰 값.
   * 이보다 낮은 세대의 실시간 프레임·이력 응답은 받아들이지 않는다(방금 버린 옛 세대가 다시 들어오지 않게).
   */
  const floorVersion = (chatRoomId: number) => {
    const listed = myVersion(chatRoomId)
    const seen = seenGeneration.get(chatRoomId)
    if (listed === undefined) return seen
    return seen === undefined ? listed : Math.max(listed, seen)
  }

  /**
   * 새 참여 세대를 관측했다. 처음 보는 방이면 기억만 하고, 오른 경우 이전 세대의 확인 위치·대기 ACK·보내는 중 표시를 버린다.
   * 이력 응답에서 관측했으면 그 이력은 새 세대라 두고, 그 밖(방 목록·실시간 프레임)이면 이력 캐시도 버린다.
   * 이력이 실패하거나 아직 없어도 방 목록이 알려 주면 보내는 중 표시를 버린다. 올랐으면 true
   */
  const observeGeneration = (
    chatRoomId: number,
    version: number,
    source: 'list' | 'history' | 'frame',
  ) => {
    const previous = seenGeneration.get(chatRoomId)
    if (previous !== undefined && version <= previous) return false
    seenGeneration.set(chatRoomId, version)
    if (previous === undefined) return false
    discardRoom(chatRoomId)
    clearRoomPending(chatRoomId)
    // 조회 중 보관한 옛 세대 메시지를 새 세대 이력에 합치지 않는다.
    discardArrivals(chatRoomId)
    if (source !== 'history') {
      historyGeneration.delete(chatRoomId)
      discardRoomState(queryClient, chatRoomId)
    }
    return true
  }

  /** 확인 위치가 오르면 누적 ACK 대기열에 넣는다 */
  const offerConfirmed = (chatRoomId: number, participationVersion: number) => {
    const confirmed = ledger
      .forRoom(userId, chatRoomId, participationVersion)
      .confirmed()
    const floor = visibleFrom.get(chatRoomId) ?? 1
    const refused = rejected.get(chatRoomId)
    if (
      refused?.version === participationVersion &&
      confirmed !== null &&
      confirmed <= refused.sequence
    )
      return
    if (confirmed !== null && confirmed >= floor) {
      lastOffered.set(chatRoomId, {
        version: participationVersion,
        sequence: confirmed,
      })
      acks.offer({
        chatRoomId,
        participationVersion,
        receivedSequence: confirmed,
      })
    }
  }

  /**
   * 이력 응답을 받아들일지. 세대는 응답의 participationVersion(없으면 방 목록)을 쓴다.
   * 방 목록이 아는 세대보다 낮으면(세대가 바뀐 사이의 옛 응답) false: 부른 쪽은 캐시에 넣지 않는다.
   */
  /**
   * replacesCache: 이 응답이 화면 이력 캐시를 새로 채우는지(화면 조회). 대조·확인용 응답은 캐시를 바꾸지 않으므로
   * 새 세대를 알려 주면 옛 세대 캐시도 버린다.
   */
  const acceptsPage = (
    chatRoomId: number,
    page: ChatMessagePage,
    cursor: number | null,
    replacesCache: boolean,
  ) => {
    if (disposed) return false
    const floor = floorVersion(chatRoomId)
    const version = page.participationVersion
    if (version === undefined || floor === undefined) {
      if (version !== undefined && cursor === null && replacesCache)
        observeGeneration(chatRoomId, version, 'history')
      return true
    }
    if (version < floor) {
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
      return false
    }
    if (version > floor) {
      // 새 세대를 이력 응답에서 먼저 알았다. 화면 조회의 최신 페이지면 그 이력은 새 세대라 두고 바로 하한을 올린다(옛 세대
      // 도착 버퍼·확인 위치·대기 ACK·보내는 중 표시는 버린다). 이전 페이지나 대조 응답이면 옛 이력에 붙이지 않고 옛 상태를
      // 버린 뒤 최신부터 다시 받는다.
      if (cursor === null && replacesCache) {
        if (observeGeneration(chatRoomId, version, 'history'))
          replacing.add(chatRoomId)
      } else {
        observeGeneration(chatRoomId, version, 'list')
        void queryClient.invalidateQueries(
          { queryKey: chatKeys.rooms() },
          { cancelRefetch: false },
        )
        return false
      }
    }
    return true
  }

  /**
   * 받아들인(그리고 이력 캐시에 반영한) 페이지를 확인 구간으로 기록한다.
   * 더 높은 세대(이 탭이 아직 모르는 새 세대)면 기록하지 않고 방 목록을 다시 부른다.
   */
  const commitPage = (
    chatRoomId: number,
    page: ChatMessagePage,
    cursor: number | null,
  ) => {
    if (disposed) return
    const known = myVersion(chatRoomId)
    const version = page.participationVersion ?? known
    if (version === undefined) return
    // 최신 페이지의 세대가 이력 캐시의 세대다. 방 목록보다 먼저 새 세대를 알려 주면 바로 세대 하한을 올리고
    // 이전 세대의 확인 위치·대기 ACK·보내는 중 표시를 버린다(늦은 옛 세대 응답이 섞이지 않게).
    if (cursor === null) historyGeneration.set(chatRoomId, version)
    if (known !== version) {
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
      return
    }
    if (page.visibleFromSequence !== undefined)
      visibleFrom.set(chatRoomId, page.visibleFromSequence)
    if (cursor === null) latestFetchedAt.set(chatRoomId, Date.now())
    const range = coverageOfPage(page, cursor)
    if (!range) return
    tracked.add(chatRoomId)
    ledger.forRoom(userId, chatRoomId, version).addRange(range.from, range.to)
    offerConfirmed(chatRoomId, version)
  }

  /**
   * 화면 이력 조회(chatMessagesQuery)가 받은 페이지. 받아들인 페이지는 바로 기록하지 않고 모아 두었다가 그 조회가
   * 캐시에 반영된 뒤(성공) 기록한다. 여러 페이지를 다시 부르다 중간에 실패하거나 취소되면 캐시는 그대로이므로
   * 모은 페이지도 버린다(캐시에 없는 구간을 ACK하지 않게).
   */
  const staged = new Map<
    number,
    { page: ChatMessagePage; cursor: number | null; signal: AbortSignal }[]
  >()
  const observePage = (
    chatRoomId: number,
    page: ChatMessagePage,
    cursor: number | null,
    signal: AbortSignal,
  ) => {
    if (!acceptsPage(chatRoomId, page, cursor, true)) return false
    staged.set(chatRoomId, [
      ...(staged.get(chatRoomId) ?? []),
      { page, cursor, signal },
    ])
    return true
  }
  const commitStaged = (chatRoomId: number) => {
    const pages = staged.get(chatRoomId) ?? []
    staged.delete(chatRoomId)
    for (const { page, cursor, signal } of pages)
      if (!signal.aborted) commitPage(chatRoomId, page, cursor)
  }

  /**
   * 실시간 메시지를 적용해도 되는지(계약 (e)). 헤더의 수신자 참여 세대가
   * - 없거나(전환 전 서버) 이 방을 모르면: 기존처럼 적용한다
   * - 알고 있는 세대보다 낮으면: 옛 세대 응답이라 적용하지 않는다
   * - 더 높으면: 다른 곳에서 재입장해 이 탭이 모르는 세대다. 이 탭의 옛 세대 이력·보내는 중 표시·확인 위치를 버리고
   *   방 목록을 다시 받는다. 이 메시지는 새 세대 이력을 불러올 때 함께 온다
   */
  const acceptsRealtime = (message: ChatMessage, meta: DeliveryMeta) => {
    if (meta.participationVersion === undefined) return true
    const floor = floorVersion(message.chatRoomId)
    if (floor === undefined) return true
    if (meta.participationVersion < floor) return false
    // 방 목록이 아직 옛 세대인데 새 세대를 기다리는 중이면, 새 세대 프레임도 이력을 다시 받을 때 함께 온다.
    if (meta.participationVersion === floor)
      return myVersion(message.chatRoomId) === floor
    // 더 높은 새 세대: 하한을 올리고 이 탭의 옛 세대 상태를 버린 뒤 방 목록을 다시 받는다.
    // 진행 중인 방 목록 조회를 끊고 다시 시작하지 않는다(새 세대 프레임이 잇달아 와도 재조회가 끝나게).
    if (
      observeGeneration(message.chatRoomId, meta.participationVersion, 'frame')
    )
      void queryClient.invalidateQueries(
        { queryKey: chatKeys.rooms() },
        { cancelRefetch: false },
      )
    return false
  }

  /** 적용한 실시간 메시지를 한 점으로 기록한다 */
  const recordRealtime = (message: ChatMessage, meta: DeliveryMeta) => {
    const version = meta.participationVersion ?? myVersion(message.chatRoomId)
    if (version === undefined) return
    // 이력 캐시가 없는 방(열지 않았거나 캐시가 지워짐)에는 메시지를 반영하지 않으므로 확인 구간으로도 기록하지 않는다.
    if (!queryClient.getQueryData(chatKeys.messages(message.chatRoomId))) return
    tracked.add(message.chatRoomId)
    ledger
      .forRoom(userId, message.chatRoomId, version)
      .addPoint(message.roomSequence)
    offerConfirmed(message.chatRoomId, version)
  }

  function discardRoom(chatRoomId: number) {
    tracked.delete(chatRoomId)
    visibleFrom.delete(chatRoomId)
    lastOffered.delete(chatRoomId)
    latestFetchedAt.delete(chatRoomId)
    ledger.discardRoom(chatRoomId)
    acks.discard(chatRoomId)
  }

  /**
   * 방 목록이 새로 오면 참여 세대가 바뀌었거나 목록에서 빠진(나감) 방의 이전 세대 상태를 버린다.
   * 다른 기기에서 나가기·재입장하고 그 실시간 프레임을 놓쳐도 방 목록이 먼저 알려 주므로, 확인 위치·대기 ACK뿐 아니라
   * 이전 세대의 이력 캐시·보내는 중 표시도 버린다(열어 둔 방은 새 범위로 다시 불러온다).
   */
  const syncGenerations = () => {
    // 방 목록의 내 세대를 관측한다(이력 성공 여부와 관계없이 이전 세대 보내는 중 표시를 버린다).
    for (const room of queryClient.getQueryData<ChatRoom[]>(chatKeys.rooms()) ??
      []) {
      const version = myVersion(room.chatRoomId)
      if (version !== undefined)
        observeGeneration(room.chatRoomId, version, 'list')
    }
    for (const chatRoomId of [...tracked]) {
      const known = ledger.peek(userId, chatRoomId)
      if (!known || known.participationVersion !== floorVersion(chatRoomId))
        discardRoom(chatRoomId)
    }
    // 목록에서 빠졌거나(나감) 관측한 세대보다 낮은 이력은 버린다.
    for (const [chatRoomId, generation] of [...historyGeneration]) {
      const floor = floorVersion(chatRoomId)
      if (
        myVersion(chatRoomId) !== undefined &&
        floor !== undefined &&
        generation >= floor
      )
        continue
      historyGeneration.delete(chatRoomId)
      discardRoomState(queryClient, chatRoomId)
    }
  }
  // 서비스를 만들기 전부터 캐시에 있던 방 목록·이력의 세대를 관측 기준으로 둔다. 첫 관측이 이보다 높으면
  // 세대가 오른 것으로 보고 이전 세대 상태를 버린다.
  for (const room of queryClient.getQueryData<ChatRoom[]>(chatKeys.rooms()) ??
    []) {
    const version = myVersion(room.chatRoomId)
    if (version !== undefined) seenGeneration.set(room.chatRoomId, version)
  }
  for (const query of queryClient
    .getQueryCache()
    .findAll({ queryKey: [chatKeys.all[0], 'messages'] })) {
    const chatRoomId = Number(query.queryKey[2])
    const version = (query.state.data as MessagePages | undefined)?.pages[0]
      ?.participationVersion
    if (version === undefined) continue
    historyGeneration.set(chatRoomId, version)
    seenGeneration.set(
      chatRoomId,
      Math.max(version, seenGeneration.get(chatRoomId) ?? version),
    )
  }

  const stopWatchingRooms = queryClient.getQueryCache().subscribe((event) => {
    if (disposed) return
    // 이력 캐시가 지워지면(화면을 떠나 정리됨·나가기) 그 데이터에 기대던 확인 위치·대기 ACK·모은 페이지도 버린다.
    // 다시 불러온 연속 구간부터 확인을 다시 시작한다.
    if (event.type === 'removed') {
      const [scope, kind, chatRoomId] = event.query.queryKey
      if (scope === chatKeys.all[0] && kind === 'messages') {
        cacheEpoch.set(
          Number(chatRoomId),
          (cacheEpoch.get(Number(chatRoomId)) ?? 0) + 1,
        )
        replacing.delete(Number(chatRoomId))
        staged.delete(Number(chatRoomId))
        historyGeneration.delete(Number(chatRoomId))
        discardRoom(Number(chatRoomId))
      }
      return
    }
    if (event.type !== 'updated') return
    const { action } = event
    const [scope, kind, chatRoomId] = event.query.queryKey
    if (action.type === 'success' && !action.manual) {
      if (event.query.queryHash === hashKey(chatKeys.rooms())) syncGenerations()
      else if (scope === chatKeys.all[0] && kind === 'messages') {
        replacing.delete(Number(chatRoomId))
        commitStaged(Number(chatRoomId))
      }
    } else if (
      scope === chatKeys.all[0] &&
      kind === 'messages' &&
      (action.type === 'error' ||
        (action.type === 'setState' &&
          event.query.state.fetchStatus === 'idle'))
    ) {
      // 조회가 실패했거나 취소돼(취소는 setState로 이전 데이터를 되돌린다) 끝났다. 모은 페이지는 버린다.
      staged.delete(Number(chatRoomId))
      // 새 세대로 바꾸던 조회였으면 캐시에는 옛 세대 대화가 남는다. 보이지 않게 버리고 다시 받는다.
      // 옛 세대 보내는 중 표시는 새 세대를 관측할 때 이미 버렸다. 그 뒤 새 세대에서 보낸 메시지는 남긴다.
      if (replacing.delete(Number(chatRoomId))) {
        historyGeneration.delete(Number(chatRoomId))
        queryClient.removeQueries({
          queryKey: chatKeys.messages(Number(chatRoomId)),
        })
      }
    }
  })

  /**
   * 열어 둔 방의 마지막 유실 대조. 최신 페이지부터 읽어 확인 구간을 기록하고, 이 기기의 확인 위치에 닿거나
   * 가시 범위의 처음에 닿을 때까지(한 번에 최대 maxPagesPerRun 페이지) 이어 읽는다.
   * 최신 페이지에 이력 캐시에 없는 메시지가 있으면 이력을 다시 불러 화면에 채운다(합칠 때 중복 제거).
   * 화면에 그리지 않은 오래된 페이지는 확인 구간으로만 쓰고 이력 캐시에 넣지 않는다.
   */
  const reconcileRoom = async (chatRoomId: number, signal: AbortSignal) => {
    const historyKey = chatKeys.messages(chatRoomId)
    // 이력을 불러오는 중이면(연결 직후 전체 재조회 등) 새로 부르지 않고 그 결과를 기다린다. 대조 시간 상한에 걸리면 그만둔다.
    if (queryClient.getQueryState(historyKey)?.fetchStatus === 'fetching')
      await Promise.race([
        queryClient
          .refetchQueries({ queryKey: historyKey }, { cancelRefetch: false })
          .catch(() => undefined),
        aborted(signal),
      ])
    if (signal.aborted) return
    const history = queryClient.getQueryData<MessagePages>(historyKey)
    if (!history) {
      // 열어 둔 방인데 첫 이력이 없고 불러오는 중도 아니면(취소·실패 뒤 멈춤) 다시 부른다.
      const state = queryClient.getQueryState(historyKey)
      if (state && state.fetchStatus === 'idle')
        void queryClient.invalidateQueries({ queryKey: historyKey })
      return
    }
    const version = myVersion(chatRoomId)
    if (version === undefined) return
    const cached = new Set(
      history.pages.flatMap((p) => p.messages.map((m) => m.messageId)),
    )
    const sequences = history.pages.flatMap((p) =>
      p.messages.map((m) => m.roomSequence),
    )
    // 비어 있으면 어떤 메시지든 화면에 없는 것이다.
    const cachedOldest = sequences.length ? Math.min(...sequences) : -Infinity

    /** 한 페이지를 읽어 기록한다. 그사이 세대가 바뀌었으면(나가기·재입장) 옛 세대 응답을 적용하지 않고 false */
    const epoch = cacheEpoch.get(chatRoomId)
    const readPage = async (cursor: number | null) => {
      const page = await api<ChatMessagePage>(`/chats/${chatRoomId}/messages`, {
        query: { cursor: cursor ?? undefined, size: CHAT_PAGE_SIZE },
        signal,
      })
      // 그사이 서비스가 끝났거나(로그아웃·회원 전환) 대조 시간 상한에 걸렸으면 반영하지 않는다.
      if (disposed || signal.aborted) return false
      // 그사이 이력 캐시가 지워졌거나 새로 만들어졌으면(화면 이탈·세대 폐기) 이 대조의 스냅샷은 낡았다.
      if (
        cacheEpoch.get(chatRoomId) !== epoch ||
        !queryClient.getQueryData(historyKey)
      )
        return false
      // 응답이 새 세대를 알려 주면 먼저 공통 관측으로 하한을 올리고 이전 세대 상태를 버린다.
      if (!acceptsPage(chatRoomId, page, cursor, false)) return false
      if (
        myVersion(chatRoomId) !== version ||
        floorVersion(chatRoomId) !== version ||
        (page.participationVersion ?? version) !== version
      ) {
        void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
        return false
      }
      // 화면이 그리는 범위에 이력 캐시에 없는 메시지가 있으면, 확인 구간을 기록하기 전에 먼저 이력 캐시에 합친다
      // (합칠 때 중복 제거). 화면 상태에 반영하지 못했으면 기록하지 않는다(반영 전에 ACK하지 않게).
      const missing = page.messages.filter(
        (m) => m.roomSequence >= cachedOldest && !cached.has(m.messageId),
      )
      if (missing.length > 0) {
        if (!mergeIntoHistory(queryClient, chatRoomId, missing)) return false
        for (const m of missing) cached.add(m.messageId)
      }
      commitPage(chatRoomId, page, cursor)
      return true
    }

    let budget = policy.reconcile.maxPagesPerRun
    // 마지막 유실을 찾으려고 최신 페이지를 읽는다. 방금 받았으면(연결 직후 재조회 등) 다시 읽지 않는다.
    // 재동기화 신호를 받았으면 방금 받았어도 다시 읽는다(신호는 그 뒤에 유실이 있었다는 뜻일 수 있다).
    const force = forced.delete(chatRoomId)
    const fetchedAt = latestFetchedAt.get(chatRoomId)
    const fresh =
      !force &&
      fetchedAt !== undefined &&
      Date.now() - fetchedAt < policy.reconcile.freshLatestMs
    if (!fresh) {
      if (!(await readPage(null))) return
      budget--
    }
    // 확인 위치에 아직 이어지지 않은 가장 낮은 구간 바로 아래부터 이어 읽는다. 읽은 구간은 기록이 남으므로
    // 페이지 상한에 걸려도 다음 대조가 이어서 읽는다(매번 최신 페이지부터 같은 페이지를 다시 읽지 않는다).
    while (budget > 0) {
      const detached = ledger
        .forRoom(userId, chatRoomId, version)
        .detachedRanges()
      if (detached.length === 0) return
      if (!(await readPage(detached[0].from))) return
      budget--
    }
  }

  const scheduler = createReconcileScheduler({
    policy: policy.reconcile,
    rooms: openRooms,
    // 이미 불러오는 중이면(연결 직후 전체 재조회 등) 끊고 다시 부르지 않는다.
    // 방 목록 대조에도 시간 상한을 둔다. 응답이 끝나지 않으면 요청을 끊고 실행 잠금을 풀어 다음 대조가 다시 부르게 한다.
    // 대조 주기마다 다시 보내기를 다 쓴 ACK를 다시 연다(값마다 maxReopenCycles번까지). 회복됐으면 이번 대조가 같은 값을
    // 다시 내놓을 때 보낸다. 주기 대조는 열어 둔 방만 다시 읽으므로, 다른 방의 소진 값은 열린 채 그 방을 다시 대조하거나
    // 새 메시지가 올 때 보낸다(재연결·재동기화는 횟수와 관계없이 다시 연다).
    runRooms: () => {
      acks.reopenExhausted()
      let timer: ReturnType<typeof setTimeout> | undefined
      return Promise.race([
        queryClient.invalidateQueries(
          { queryKey: chatKeys.rooms() },
          { throwOnError: true, cancelRefetch: false },
        ),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            void queryClient.cancelQueries({ queryKey: chatKeys.rooms() })
            resolve()
          }, policy.reconcile.runTimeoutMs)
        }),
      ]).finally(() => clearTimeout(timer))
    },
    runRoom: (chatRoomId) => {
      // 한 방 대조에 시간 상한을 둔다. 응답이 끝나지 않아도 실행 슬롯을 비워 다음 주기·재동기화가 다시 대조하게 한다.
      const run = new AbortController()
      const stopOnDispose = () => run.abort()
      lifetime.signal.addEventListener('abort', stopOnDispose)
      // 시간 상한에 걸리면 기다리던 화면 이력 조회도 끊어, 다음 대조가 새 요청을 시작하게 한다.
      const timer = setTimeout(() => {
        run.abort()
        const historyKey = chatKeys.messages(chatRoomId)
        void queryClient.cancelQueries({ queryKey: historyKey }).then(() => {
          // 첫 이력을 받기 전이었으면(데이터 없이 대기로 되돌아감) 아무도 다시 부르지 않으므로 다시 부른다.
          if (!disposed && !queryClient.getQueryData(historyKey))
            void queryClient.invalidateQueries({ queryKey: historyKey })
        })
      }, policy.reconcile.runTimeoutMs)
      return Promise.race([
        reconcileRoom(chatRoomId, run.signal),
        aborted(run.signal),
      ]).finally(() => {
        clearTimeout(timer)
        lifetime.signal.removeEventListener('abort', stopOnDispose)
      })
    },
  })

  // 종료 이벤트에만 의존하지 않지만, 탭을 닫거나 가릴 때는 기다리던 ACK를 바로 보낸다.
  // 화면에 돌아오면 바로 대조한다(가려진 동안 놓친 마지막 메시지).
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') acks.flushAll()
    else scheduler.trigger(null)
  }
  const flushOnPageHide = () => acks.flushAll()
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', flushOnPageHide)

  return {
    observePage,
    /** 이 탭이 관측한 가장 높은 참여 세대(방 목록·이력·실시간). 전송 확인도 이 값으로 세대를 맞춘다 */
    generationOf: floorVersion,
    /**
     * 화면 밖에서 받은 이력 응답(전송 확인 등)의 참여 세대를 알린다. 더 높으면 하한을 올리고 이전 세대 상태를 버린 뒤
     * 방 목록·이력을 다시 받는다
     */
    noticeGeneration: (chatRoomId: number, version: number) => {
      if (disposed) return
      const floor = floorVersion(chatRoomId)
      if (floor !== undefined && version <= floor) return
      if (observeGeneration(chatRoomId, version, 'list'))
        void queryClient.invalidateQueries(
          { queryKey: chatKeys.rooms() },
          { cancelRefetch: false },
        )
    },
    acceptsRealtime,
    recordRealtime,
    /**
     * 연결·재연결 직후 바로 대조한다(방금 다시 불러온 최신 페이지는 다시 읽지 않는다).
     * 다시 보내기를 다 쓴 ACK도 횟수와 관계없이 다시 연다(연결이 회복됐다)
     */
    reconnected: () => {
      acks.reopenExhausted({ force: true })
      scheduler.trigger(null)
    },
    /**
     * 실시간 메시지의 순번 간격이 유예 뒤에도 비어 있거나, 방 topic 구독이 거절·회수됐다. 열어 둔 방이고 이력을 불러
     * 두었으면 방 목록 다음에 그 방을 최신 페이지부터 대조하고(방금 받은 최신 페이지도 생략하지 않는다), 아니면 방 목록만
     * 다시 받는다(열지 않은 방의 이력은 열 때 다시 불러온다)
     */
    reconcileGap: (chatRoomId: number) => {
      if (disposed) return
      if (
        openRooms().includes(chatRoomId) &&
        queryClient.getQueryData(chatKeys.messages(chatRoomId))
      ) {
        forced.add(chatRoomId)
        scheduler.trigger(chatRoomId)
      } else scheduler.triggerRooms()
    },
    /** 재동기화 신호(`/user/queue/chats/sync`): 열어 둔 방의 최신 페이지부터 바로 다시 대조한다 */
    resync: () => {
      acks.reopenExhausted({ force: true })
      for (const chatRoomId of openRooms()) forced.add(chatRoomId)
      scheduler.trigger(null)
    },
    /** 연결된 동안 주기 대조를 돌린다 */
    start: () => scheduler.start(),
    stop: () => scheduler.stop(),
    /** 나가기·재입장 등으로 이 방의 이전 참여 상태를 버린다 */
    discardRoom,
    dispose: () => {
      disposed = true
      lifetime.abort()
      staged.clear()
      seenGeneration.clear()
      cacheEpoch.clear()
      replacing.clear()
      forced.clear()
      historyGeneration.clear()
      scheduler.stop()
      stopWatchingRooms()
      acks.dispose()
      ledger.clear()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flushOnPageHide)
    },
  }
}

export type ReceiptService = ReturnType<typeof createReceiptService>
