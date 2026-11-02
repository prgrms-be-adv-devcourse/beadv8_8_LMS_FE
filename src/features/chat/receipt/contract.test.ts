import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '@/test/server'
import { ApiError } from '@/shared/api/ApiError'
import {
  ackResultOf,
  createRestAckTransport,
  readDeliveryMeta,
} from './contract'

const err = (status: number, code?: string) =>
  new ApiError(status, code ? { status, code, detail: code } : null)

describe('ACK 오류 → 처리 (계약 d)', () => {
  it.each([
    [409, 'STALE_PARTICIPATION'],
    [403, 'NOT_CHAT_ROOM_MEMBER'],
    [404, 'CHAT_ROOM_NOT_FOUND'],
  ])('%i %s는 다시 보내지 않고 재동기화한다(stale)', (status, code) => {
    expect(ackResultOf(err(status, code))).toBe('stale')
  })

  it.each([
    [400, 'INVALID_REQUEST'],
    [403, 'CHAT_NOT_ALLOWED'],
    [401, undefined],
    [403, undefined],
    [404, undefined],
    [422, 'SOMETHING'],
  ])('%i %s는 버린다(drop)', (status, code) => {
    expect(ackResultOf(err(status, code))).toBe('drop')
  })

  it('5xx·네트워크 오류는 다시 보낸다(retry)', () => {
    expect(ackResultOf(err(500))).toBe('retry')
    expect(ackResultOf(err(503, 'INTERNAL_ERROR'))).toBe('retry')
    expect(ackResultOf(new TypeError('Failed to fetch'))).toBe('retry')
  })
})

describe('범위 밖 ACK', () => {
  it('400 RECEIVED_SEQUENCE_OUT_OF_RANGE는 세대는 그대로라 보내는 중 표시를 지키는 재동기화(resync)로 본다', () => {
    expect(ackResultOf(err(400, 'RECEIVED_SEQUENCE_OUT_OF_RANGE'))).toBe(
      'resync',
    )
  })
})

describe('participation-version 헤더', () => {
  it('정수면 읽고, 없거나 정수가 아니면 세대 검사를 건너뛴다', () => {
    expect(readDeliveryMeta({ 'participation-version': '3' })).toEqual({
      participationVersion: 3,
    })
    expect(readDeliveryMeta({})).toEqual({})
    expect(readDeliveryMeta(undefined)).toEqual({})
    expect(readDeliveryMeta({ 'participation-version': 'x' })).toEqual({})
    expect(readDeliveryMeta({ 'participation-version': '1.5' })).toEqual({})
    // 빈 값을 세대 0으로 읽어 프레임을 버리지 않는다.
    expect(readDeliveryMeta({ 'participation-version': '' })).toEqual({})
    expect(readDeliveryMeta({ 'participation-version': ' 4 ' })).toEqual({
      participationVersion: 4,
    })
  })
})

describe('REST ACK 전송', () => {
  it('응답이 시간 안에 끝나지 않으면 요청을 끊고 응답 유실(retry)로 본다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    document.cookie = 'XSRF-TOKEN=t'
    server.use(
      http.put('*/api/v1/chats/5/received', () => new Promise<never>(() => {})),
    )
    const transport = createRestAckTransport(1_000)
    const result = transport.send({
      chatRoomId: 5,
      participationVersion: 2,
      receivedSequence: 3,
    })
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(result).resolves.toBe('retry')
    vi.useRealTimers()
  })
})

describe('REST ACK 전송 (CSRF 토큰 받기)', () => {
  it('CSRF 토큰을 받는 요청이 멈춰도 시간 상한 뒤 retry로 끝난다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // 토큰 쿠키가 없으면 먼저 /members/me로 토큰을 받는다. 그 요청이 끝나지 않는다.
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    let tokenRequest: Request | undefined
    server.use(
      http.get('*/api/v1/members/me', ({ request }) => {
        tokenRequest = request
        return new Promise<never>(() => {})
      }),
    )
    const transport = createRestAckTransport(1_000)
    const result = transport.send({
      chatRoomId: 5,
      participationVersion: 2,
      receivedSequence: 3,
    })
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(result).resolves.toBe('retry')
    // 토큰을 받는 요청도 끊는다(매달린 요청이 쌓이지 않게).
    expect(tokenRequest?.signal.aborted).toBe(true)
    vi.useRealTimers()
  })
})

describe('REST ACK 전송 (바깥 취소)', () => {
  it('대기열이 끊으면 CSRF 토큰 받기 요청부터 끊는다', async () => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    let tokenRequest: Request | undefined
    server.use(
      http.get('*/api/v1/members/me', ({ request }) => {
        tokenRequest = request
        return new Promise<never>(() => {})
      }),
    )
    const outer = new AbortController()
    const result = createRestAckTransport(60_000).send(
      { chatRoomId: 5, participationVersion: 2, receivedSequence: 3 },
      outer.signal,
    )
    await vi.waitFor(() => expect(tokenRequest).toBeDefined())
    outer.abort()
    await expect(result).resolves.not.toBe('ok')
    expect(tokenRequest?.signal.aborted).toBe(true)
  })
})

describe('REST ACK 전송 (리스너 정리)', () => {
  it('요청이 끝나면 바깥 취소 신호에 붙인 리스너를 뗀다', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    server.use(
      http.put('*/api/v1/chats/5/received', () =>
        HttpResponse.json({ statusCode: 200, message: '', data: {} }),
      ),
    )
    const outer = new AbortController()
    const add = vi.spyOn(outer.signal, 'addEventListener')
    const remove = vi.spyOn(outer.signal, 'removeEventListener')
    await expect(
      createRestAckTransport(60_000).send(
        { chatRoomId: 5, participationVersion: 2, receivedSequence: 3 },
        outer.signal,
      ),
    ).resolves.toBe('ok')
    expect(add).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1])
  })
})
