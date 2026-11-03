import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/entities/chat/types'
import {
  applyReadCountsFrame,
  clearReadCounts,
  discardReadCounts,
  isReadCountsFrame,
  recordMessageCounts,
  useUnreadMemberCount,
} from './readCounts'

const text = (
  roomSequence: number,
  unreadMemberCount?: number | null,
): ChatMessage => ({
  messageId: roomSequence,
  chatRoomId: 1,
  roomSequence,
  senderUserId: 2,
  messageType: 'TEXT',
  content: '',
  sentAt: '2026-11-03T10:00:00',
  unreadMemberCount,
})

const shown = (message: ChatMessage) =>
  renderHook(() => useUnreadMemberCount(message)).result

afterEach(() => clearReadCounts())

describe('안 읽은 사람 수 기록', () => {
  it('기록한 값과 메시지 값 중 작은 값을 보이고, 0·값 없음·안내는 숨긴다', () => {
    recordMessageCounts(1, [text(1, 2)])
    expect(shown(text(1, 3)).current).toBe(2)
    expect(shown(text(1, 1)).current).toBe(1)
    expect(shown(text(2, 0)).current).toBeUndefined()
    expect(shown(text(3)).current).toBeUndefined()
    expect(
      shown({ ...text(4, 2), messageType: 'SYSTEM' }).current,
    ).toBeUndefined()
  })

  it('참여 세대가 바뀌어 방의 값을 버리면 새 세대의 값을 그대로 쓴다', () => {
    recordMessageCounts(1, [text(1, 0)])
    const result = shown(text(1, 2))
    expect(result.current).toBeUndefined()
    act(() => discardReadCounts(1))
    expect(result.current).toBe(2)
  })

  it('갱신 프레임은 아는 메시지만 낮춘다(모르는 순번은 받을 때 메시지 값으로 기록한다)', () => {
    applyReadCountsFrame(
      {
        type: 'READ_COUNTS',
        roomId: 1,
        readCountVersion: 1,
        fromSequence: 1,
        toSequence: 5,
        counts: [],
      },
      [text(1, 2)],
    )
    expect(shown(text(1, 2)).current).toBeUndefined()
    expect(shown(text(3, 2)).current).toBe(2)
  })
})

describe('isReadCountsFrame', () => {
  const frame = {
    type: 'READ_COUNTS',
    roomId: 1,
    readCountVersion: 1,
    fromSequence: 1,
    toSequence: 2,
    counts: [{ roomSequence: 2, unreadMemberCount: 1 }],
  }
  it('형식이 맞는 프레임만 받는다', () => {
    expect(isReadCountsFrame(frame)).toBe(true)
    expect(isReadCountsFrame({ ...frame, toSequence: undefined })).toBe(false)
    expect(isReadCountsFrame({ ...frame, fromSequence: 3 })).toBe(false)
    expect(
      isReadCountsFrame({
        ...frame,
        counts: [{ roomSequence: 2, unreadMemberCount: -1 }],
      }),
    ).toBe(false)
  })
})
