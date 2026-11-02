import { describe, expect, it } from 'vitest'
import type { ChatMessage, ChatMessagePage } from '@/entities/chat/types'
import {
  BEGIN,
  RoomCoverage,
  coverageOfPage,
  createReceiptLedger,
} from './coverage'

const message = (roomSequence: number): ChatMessage => ({
  messageId: roomSequence + 1000,
  chatRoomId: 5,
  roomSequence,
  senderUserId: 8,
  messageType: 'TEXT',
  content: `메시지 ${roomSequence}`,
  sentAt: '2026-10-29T10:00:00',
})

/** 최신순 페이지 */
const page = (seqs: number[], nextCursor: number | null): ChatMessagePage => ({
  messages: [...seqs].sort((a, b) => b - a).map(message),
  nextCursor,
})

describe('coverageOfPage', () => {
  it('최신 페이지(cursor 없음)는 페이지의 가장 큰 순번까지, 더 오래된 게 있으면 가장 작은 순번부터다', () => {
    expect(coverageOfPage(page([8, 9, 10], 8), null)).toEqual({
      from: 8,
      to: 10,
    })
  })

  it('cursor로 읽은 페이지는 cursor - 1까지다(사이에 숨겨진 순번이 있어도 서버가 확인한 구간이다)', () => {
    expect(coverageOfPage(page([3, 5, 6], 3), 8)).toEqual({ from: 3, to: 7 })
  })

  it('nextCursor가 null이면 가시 범위의 시작(BEGIN)부터다', () => {
    expect(coverageOfPage(page([4, 5], null), null)).toEqual({
      from: BEGIN,
      to: 5,
    })
    expect(coverageOfPage(page([4, 5], null), 9)).toEqual({
      from: BEGIN,
      to: 8,
    })
  })

  it('빈 최신 페이지는 아무것도 알려 주지 않는다', () => {
    expect(coverageOfPage(page([], null), null)).toBeNull()
  })

  it('cursor로 읽은 빈 페이지가 끝(nextCursor null)이면 BEGIN부터 cursor - 1까지다', () => {
    expect(coverageOfPage(page([], null), 12)).toEqual({ from: BEGIN, to: 11 })
  })

  it('빈 페이지인데 더 있다고 하면 확인한 구간이 없다', () => {
    expect(coverageOfPage(page([], 5), 12)).toBeNull()
  })
})

describe('RoomCoverage', () => {
  it('BEGIN에 닿기 전에는 높은 순번이 많아도 확인 위치가 없다', () => {
    const coverage = new RoomCoverage()
    coverage.addPoint(10)
    coverage.addPoint(11)
    coverage.addRange(3, 9)
    expect(coverage.confirmed()).toBeNull()
    expect(coverage.detachedRanges()).toEqual([{ from: 3, to: 11 }])
  })

  it('연속 구간만 전진한다: 99까지 확인 뒤 101이 와도 99, 100을 채우면 101', () => {
    const coverage = new RoomCoverage()
    coverage.addRange(BEGIN, 99)
    coverage.addPoint(101)
    expect(coverage.confirmed()).toBe(99)
    coverage.addRange(100, 100)
    expect(coverage.confirmed()).toBe(101)
    expect(coverage.detachedRanges()).toEqual([])
  })

  it('맞닿은 구간을 합치고 확정 위치 아래 구간은 버린다', () => {
    const coverage = new RoomCoverage()
    coverage.addRange(20, 25)
    coverage.addRange(10, 14)
    coverage.addRange(15, 19)
    expect(coverage.detachedRanges()).toEqual([{ from: 10, to: 25 }])
    coverage.addRange(30, 31)
    coverage.addRange(BEGIN, 9)
    expect(coverage.confirmed()).toBe(25)
    expect(coverage.detachedRanges()).toEqual([{ from: 30, to: 31 }])
  })

  it('줄어들지 않는다', () => {
    const coverage = new RoomCoverage()
    coverage.addRange(BEGIN, 50)
    coverage.addRange(BEGIN, 40)
    coverage.addRange(10, 20)
    expect(coverage.confirmed()).toBe(50)
  })

  it('여러 페이지를 이어 읽어 BEGIN에 닿으면 그 합집합의 끝까지 확정한다', () => {
    const coverage = new RoomCoverage()
    const latest = coverageOfPage(page([18, 19, 20], 18), null)
    const older = coverageOfPage(page([12, 14, 17], 12), 18)
    const oldest = coverageOfPage(page([5, 7], null), 12)
    for (const range of [latest, older]) {
      if (range) coverage.addRange(range.from, range.to)
    }
    expect(coverage.confirmed()).toBeNull()
    if (oldest) coverage.addRange(oldest.from, oldest.to)
    expect(coverage.confirmed()).toBe(20)
  })

  it('잘못된 구간은 무시한다', () => {
    const coverage = new RoomCoverage()
    coverage.addRange(10, 5)
    coverage.addPoint(Number.NaN)
    expect(coverage.detachedRanges()).toEqual([])
    expect(coverage.confirmed()).toBeNull()
  })
})

describe('createReceiptLedger', () => {
  it('같은 회원·방·세대면 같은 확인 구간을 돌려준다', () => {
    const ledger = createReceiptLedger()
    const coverage = ledger.forRoom(1, 5, 2)
    coverage.addRange(BEGIN, 10)
    expect(ledger.forRoom(1, 5, 2).confirmed()).toBe(10)
    expect(ledger.forRoom(2, 5, 2).confirmed()).toBeNull()
  })

  it('참여 세대가 바뀌면 이전 확인 위치를 버리고 새로 시작한다', () => {
    const ledger = createReceiptLedger()
    ledger.forRoom(1, 5, 2).addRange(BEGIN, 10)
    const next = ledger.forRoom(1, 5, 3)
    expect(next.confirmed()).toBeNull()
    expect(ledger.peek(1, 5)?.participationVersion).toBe(3)
    expect(ledger.peek(1, 5)?.coverage).toBe(next)
  })

  it('peek은 만들지 않고, discardRoom·clear는 버린다', () => {
    const ledger = createReceiptLedger()
    expect(ledger.peek(1, 5)).toBeUndefined()
    ledger.forRoom(1, 5, 1)
    ledger.forRoom(2, 5, 1)
    ledger.forRoom(1, 6, 1)
    ledger.discardRoom(5)
    expect(ledger.peek(1, 5)).toBeUndefined()
    expect(ledger.peek(2, 5)).toBeUndefined()
    expect(ledger.peek(1, 6)).toBeDefined()
    ledger.clear()
    expect(ledger.peek(1, 6)).toBeUndefined()
  })
})
