import { describe, expect, it } from 'vitest'
import { groupRoom } from '@/test/chatGroupMock'
import { daysUntil, groupPermissions, groupStatusNotice } from './group'
import type { ChatGroupSummary, ChatRoom } from './types'

const HOST = 1
const GUEST = 2
const room = (
  status: ChatRoom['status'],
  group: Partial<ChatGroupSummary> = {},
) =>
  groupRoom({ status }, { hostUserId: HOST, ...group }) as ChatRoom & {
    group: ChatGroupSummary
  }

describe('groupPermissions', () => {
  it('사용 중: 모두 보낼 수 있고 호스트는 초대·내보내기·폐쇄, 게스트는 나가기', () => {
    expect(groupPermissions(room('ACTIVE'), HOST)).toEqual({
      host: true,
      canSend: true,
      canInvite: true,
      canKick: true,
      canClose: true,
      canLeave: false,
    })
    expect(groupPermissions(room('ACTIVE'), GUEST)).toMatchObject({
      host: false,
      canSend: true,
      canInvite: false,
      canClose: false,
      canLeave: true,
    })
  })

  it('일시 중지: 보내기·초대·내보내기를 막고 호스트는 폐쇄만 할 수 있다', () => {
    expect(groupPermissions(room('SUSPENDED'), HOST)).toMatchObject({
      canSend: false,
      canInvite: false,
      canKick: false,
      canClose: true,
      canLeave: false,
    })
  })

  it('읽기 전용: 호스트는 직접 폐쇄한 방에서만 나갈 수 있다', () => {
    const closed = room('READ_ONLY', { statusReason: 'CLOSED_BY_HOST' })
    const unavailable = room('READ_ONLY', { statusReason: 'HOST_UNAVAILABLE' })
    expect(groupPermissions(closed, HOST)).toMatchObject({
      canSend: false,
      canClose: false,
      canLeave: true,
    })
    expect(groupPermissions(unavailable, HOST).canLeave).toBe(false)
    expect(groupPermissions(unavailable, GUEST).canLeave).toBe(true)
  })
})

describe('daysUntil', () => {
  const now = Date.parse('2026-11-03T01:00:00Z') // KST 10:00
  it('남은 날을 올림하고, 지났으면 0, 모르면 undefined', () => {
    expect(daysUntil('2026-11-04T10:00:00', now)).toBe(1)
    expect(daysUntil('2026-11-04T10:00:01', now)).toBe(2)
    expect(daysUntil('2026-11-03T10:00:00', now)).toBe(0)
    expect(daysUntil(null, now)).toBeUndefined()
  })
})

describe('groupStatusNotice', () => {
  it('사용 중이면 안내가 없고, 사유에 따라 읽기 전용 안내를 고른다', () => {
    expect(groupStatusNotice(room('ACTIVE'), true)).toBeNull()
    expect(
      groupStatusNotice(
        room('READ_ONLY', { statusReason: 'HOST_UNAVAILABLE' }),
        false,
      ),
    ).toMatch(/^호스트가 방을 운영할 수 없게 되어 읽기 전용이 됐어요/)
    expect(
      groupStatusNotice(
        room('READ_ONLY', { statusReason: 'CLOSED_BY_HOST' }),
        true,
      ),
    ).toMatch(/^폐쇄한 방이에요/)
  })
})
