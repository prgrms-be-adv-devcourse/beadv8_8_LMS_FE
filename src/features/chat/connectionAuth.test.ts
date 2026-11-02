import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from '@/shared/auth/token'
import { server } from '@/test/server'
import {
  createReauth,
  REAUTH_BEFORE_MS,
  requestTicket,
  type TicketResult,
} from './connectionAuth'

const MIN = 60_000
const ticket = (n: number): TicketResult => ({
  ok: true,
  ticket: {
    ticket: `t-${n}`,
    expiresIn: 30,
    connectionExpiresAt: new Date(Date.now() + 15 * MIN).toISOString(),
  },
})
const at = (ms: number) => new Date(Date.now() + ms).toISOString()

describe('createReauth', () => {
  let sent: string[]
  let request: ReturnType<
    typeof vi.fn<(options: { minTokenMs: number }) => Promise<TicketResult>>
  >
  let onSignedOut: ReturnType<typeof vi.fn<() => void>>
  let calls: number

  beforeEach(() => {
    vi.useFakeTimers()
    sent = []
    calls = 0
    request = vi.fn(async () => ticket(++calls))
    onSignedOut = vi.fn<() => void>()
  })
  afterEach(() => vi.useRealTimers())

  const setup = () =>
    createReauth({
      request,
      send: (t) => {
        sent.push(t)
        return true
      },
      onSignedOut,
      now: Date.now,
      retryDelay: (failures) => 3_000 * 2 ** failures,
    })

  it('연결 만료 60초 전에 새 티켓을 받아 재인증 프레임을 보낸다', async () => {
    const reauth = setup()
    reauth.start(at(15 * MIN))

    await vi.advanceTimersByTimeAsync(15 * MIN - REAUTH_BEFORE_MS - 1_000)
    expect(request).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sent).toEqual(['t-1'])
  })

  it('성공하면 새 만료 60초 전으로 다음 재인증을 잡는다', async () => {
    const reauth = setup()
    reauth.start(at(2 * MIN))
    await vi.advanceTimersByTimeAsync(MIN)
    expect(sent).toEqual(['t-1'])

    reauth.handle({
      type: 'REAUTHENTICATED',
      code: null,
      connectionExpiresAt: at(15 * MIN),
    })
    await vi.advanceTimersByTimeAsync(14 * MIN)
    expect(sent).toEqual(['t-1', 't-2'])
  })

  it('INVALID_TICKET이면 새 티켓으로 한 번만 다시 시도한다', async () => {
    const reauth = setup()
    reauth.start(at(2 * MIN))
    await vi.advanceTimersByTimeAsync(MIN)
    const failed = {
      type: 'REAUTH_FAILED',
      code: 'INVALID_TICKET',
      connectionExpiresAt: at(MIN),
    }
    reauth.handle(failed)
    await vi.advanceTimersByTimeAsync(0)
    reauth.handle(failed)
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toEqual(['t-1', 't-2'])
  })

  it.each(['MEMBER_MISMATCH', 'CONNECTION_CLOSING', 'SOMETHING_NEW'])(
    '%s면 다시 시도하지 않는다(기존 만료에 4401로 닫힌다)',
    async (code) => {
      const reauth = setup()
      reauth.start(at(2 * MIN))
      await vi.advanceTimersByTimeAsync(MIN)
      reauth.handle({
        type: 'REAUTH_FAILED',
        code,
        connectionExpiresAt: at(MIN),
      })
      await vi.advanceTimersByTimeAsync(MIN)
      expect(sent).toEqual(['t-1'])
    },
  )

  it('연결이 끊기면(stop) 타이머를 멈추고, 진행 중인 티켓 요청 결과도 보내지 않는다', async () => {
    let release!: () => void
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(ticket(99))
        }),
    )
    const reauth = setup()
    reauth.start(at(2 * MIN))
    await vi.advanceTimersByTimeAsync(MIN)
    expect(request).toHaveBeenCalledTimes(1)

    reauth.stop()
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toEqual([])

    // 멈춘 뒤에는 시간이 지나도 다시 하지 않는다.
    reauth.start(at(30 * MIN))
    reauth.stop()
    await vi.advanceTimersByTimeAsync(30 * MIN)
    expect(sent).toEqual([])
  })

  it('만료를 모르거나 이미 너무 가까우면 재인증하지 않는다', async () => {
    const reauth = setup()
    reauth.start(null)
    await vi.advanceTimersByTimeAsync(30 * MIN)
    reauth.start(at(3_000))
    await vi.advanceTimersByTimeAsync(3_000)
    expect(request).not.toHaveBeenCalled()
  })

  it('같은 만료로 성공하면(만료가 늘지 않음) 곧바로 다시 재인증하지 않는다', async () => {
    const reauth = setup()
    const expiry = at(2 * MIN)
    reauth.start(expiry)
    await vi.advanceTimersByTimeAsync(MIN)
    expect(sent).toEqual(['t-1'])

    reauth.handle({
      type: 'REAUTHENTICATED',
      code: null,
      connectionExpiresAt: expiry,
    })
    await vi.advanceTimersByTimeAsync(MIN)
    expect(sent).toEqual(['t-1'])
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('재인증 티켓은 지금 연결 만료 뒤로도 60초 넘게 남는 토큰으로 받게 한다', async () => {
    const reauth = setup()
    reauth.start(at(2 * MIN))
    await vi.advanceTimersByTimeAsync(MIN)
    // 만료까지 60초 남았으니 토큰은 120초 넘게 남아야 한다(아니면 먼저 다시 받는다).
    expect(request).toHaveBeenCalledWith({ minTokenMs: 2 * MIN })
  })

  it('티켓을 받지 못하면(429·503) 간격을 늘려 다시 받고, 만료가 가까우면 그만둔다', async () => {
    request.mockResolvedValueOnce({ ok: false, reason: 'retry' })
    request.mockResolvedValueOnce({ ok: false, reason: 'retry' })
    const reauth = setup()
    reauth.start(at(2 * MIN))
    await vi.advanceTimersByTimeAsync(MIN)
    expect(request).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(request).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(6_000)
    expect(sent).toEqual(['t-1'])

    // 계속 실패해도 만료가 너무 가까워지면 더 받지 않는다.
    request.mockResolvedValue({ ok: false, reason: 'retry' })
    reauth.start(at(70_000))
    await vi.advanceTimersByTimeAsync(10_000)
    const before = request.mock.calls.length
    await vi.advanceTimersByTimeAsync(2 * MIN)
    expect(request.mock.calls.length - before).toBeLessThanOrEqual(4)
  })

  it('토큰을 다시 받지 못하면(로그아웃) 알린다', async () => {
    request.mockResolvedValueOnce({ ok: false, reason: 'signedOut' })
    const reauth = setup()
    reauth.start(at(2 * MIN))
    await vi.advanceTimersByTimeAsync(MIN)
    expect(onSignedOut).toHaveBeenCalledTimes(1)
    expect(sent).toEqual([])
  })
})

describe('requestTicket', () => {
  const tickets = (respond: () => Response) => {
    const seen: (string | null)[] = []
    server.use(
      http.post('*/api/v1/chats/ws-tickets', ({ request }) => {
        seen.push(request.headers.get('Authorization'))
        return respond()
      }),
    )
    return seen
  }
  const ok = () =>
    HttpResponse.json({
      statusCode: 200,
      message: '',
      data: { ticket: 'abc', expiresIn: 30, connectionExpiresAt: at(MIN) },
    })
  const refreshTo = (token: string) =>
    server.use(
      http.post('*/api/v1/members/auth/refresh', () =>
        HttpResponse.json({
          statusCode: 200,
          message: '',
          data: { accessToken: token, expiresIn: 900 },
        }),
      ),
    )

  it('토큰이 60초 넘게 남았으면 그대로 티켓을 받는다', async () => {
    setAccessToken('current', 600)
    const seen = tickets(ok)
    await expect(requestTicket()).resolves.toMatchObject({
      ok: true,
      ticket: { ticket: 'abc' },
    })
    expect(seen).toEqual(['Bearer current'])
  })

  it('60초 안에 만료되면 먼저 다시 받는다', async () => {
    setAccessToken('old', 50)
    refreshTo('new')
    const seen = tickets(ok)
    await requestTicket()
    expect(seen).toEqual(['Bearer new'])
  })

  it('다시 받지 못하면(refresh 401) 티켓을 받지 않고 로그아웃으로 본다', async () => {
    setAccessToken('old', 50)
    const seen = tickets(ok)
    await expect(requestTicket()).resolves.toEqual({
      ok: false,
      reason: 'signedOut',
    })
    expect(seen).toEqual([])
  })

  it.each([
    [429, 'retry'],
    [503, 'retry'],
    [500, 'retry'],
  ])('%d는 %s', async (status, reason) => {
    setAccessToken('current', 600)
    tickets(() => HttpResponse.json({ status }, { status }))
    await expect(requestTicket()).resolves.toEqual({ ok: false, reason })
  })

  it('403(채팅 불가 회원)은 forbidden', async () => {
    setAccessToken('current', 600)
    refreshTo('current')
    tickets(() => HttpResponse.json({ status: 403 }, { status: 403 }))
    await expect(requestTicket()).resolves.toEqual({
      ok: false,
      reason: 'forbidden',
    })
  })

  it('401이 계속되고 토큰도 다시 받지 못하면 로그아웃으로 본다', async () => {
    setAccessToken('current', 600)
    tickets(() => new HttpResponse(null, { status: 401 }))
    await expect(requestTicket()).resolves.toEqual({
      ok: false,
      reason: 'signedOut',
    })
  })
})
