import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { memberDb } from '@/mocks/member'
import { renderApp } from '@/test/renderApp'
import { server } from '@/test/server'

// 관리자 채널 심사 API는 MSW 목(src/mocks/member.ts)이 BE처럼 응답한다.

afterEach(() => queryClient.clear())

const item = (nickname: string) =>
  screen.findByRole('listitem', { name: `${nickname}의 채널 인증 신청` })

describe('관리자 채널 인증 심사', () => {
  it('심사 대기 채널을 오래된 신청부터 보여 주고 대기 건수를 센다', async () => {
    renderApp('/admin/channels', 'ADMIN')

    const first = await item('새벽기타')
    expect(
      within(first).getByRole('link', { name: '치지직 · 새벽기타 라이브' }),
    ).toHaveAttribute('href', 'https://chzzk.naver.com/dawnguitar')
    expect(
      within(first).getByText(/팔로워 7명 \(.+ 기준\)/),
    ).toBeInTheDocument()
    expect(within(first).getByText(/신청/)).toBeInTheDocument()
    const list = screen.getByRole('list', { name: '채널 심사 목록' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual(['새벽기타의 채널 인증 신청', '편집하는 고래의 채널 인증 신청'])
    expect(screen.getByText('대기 2건')).toBeInTheDocument()
  })

  it('반려 탭은 URL에 남고 처리일과 반려 사유를 보여 주며 심사 버튼이 없다', async () => {
    const router = renderApp('/admin/channels', 'ADMIN')
    await item('새벽기타')
    // 행에도 반려 버튼이 있으므로 상태 탭 안에서 찾는다.
    const tabs = screen.getByRole('group', { name: '심사 상태' })
    await userEvent.click(within(tabs).getByRole('button', { name: '반려' }))

    expect(router.state.location.search).toBe('?status=REJECTED')
    const rejected = await item('노을')
    expect(within(rejected).getByText(/처리/)).toBeInTheDocument()
    expect(
      within(rejected).getByText('반려 사유: 본인 채널인지 확인되지 않아요'),
    ).toBeInTheDocument()
    expect(within(rejected).queryByRole('button')).toBeNull()
  })

  it('승인은 확인창을 거쳐 처리하고 목록을 다시 불러온다', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    renderApp('/admin/channels', 'ADMIN')
    const row = await item('새벽기타')
    await userEvent.click(within(row).getByRole('button', { name: '승인' }))

    const dialog = screen.getByRole('dialog', { name: '이 채널을 승인할까요?' })
    expect(within(dialog).getByText('새벽기타 (회원 #21)')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '승인' }))

    expect(
      await screen.findByText(
        '채널을 승인했어요. 유저였다면 인플루언서가 돼요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByRole('listitem', { name: '새벽기타의 채널 인증 신청' }),
      ).toBeNull(),
    )
    expect(screen.getByText('대기 1건')).toBeInTheDocument()
    expect(memberDb.channels.find((c) => c.channelId === 101)?.status).toBe(
      'APPROVED',
    )
  })

  it('반려는 사유가 있어야 보낼 수 있고, 자주 쓰는 사유를 고쳐 보낸다', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    renderApp('/admin/channels', 'ADMIN')
    const row = await item('새벽기타')
    await userEvent.click(within(row).getByRole('button', { name: '반려' }))

    const dialog = screen.getByRole('dialog', { name: '이 채널을 반려할까요?' })
    const confirm = within(dialog).getByRole('button', { name: '반려' })
    expect(confirm).toBeDisabled()
    const reason = within(dialog).getByLabelText('반려 사유')
    await userEvent.type(reason, '   ')
    expect(confirm).toBeDisabled()
    expect(reason).toHaveAttribute('maxLength', '500')

    await userEvent.click(
      within(dialog).getByRole('button', {
        name: /인증 코드를 찾을 수 없어요/,
      }),
    )
    await userEvent.type(reason, ' (소개란 확인 필요)')
    await userEvent.click(confirm)

    expect(
      await screen.findByText('채널을 반려했어요. 사유가 회원에게 보여요.'),
    ).toBeInTheDocument()
    expect(memberDb.channels.find((c) => c.channelId === 101)).toMatchObject({
      status: 'REJECTED',
      rejectionReason:
        '채널 소개란에서 인증 코드를 찾을 수 없어요 (소개란 확인 필요)',
    })
  })

  it('이미 처리된 채널이면 안내하고 목록을 다시 불러온다', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    let listCalls = 0
    server.use(
      http.get('*/api/v1/members/admin/channels', () => {
        listCalls++
        return HttpResponse.json({
          statusCode: 200,
          message: '',
          data: {
            content: memberDb.channels.filter((c) => c.status === 'PENDING'),
            page: { size: 10, number: 0, totalElements: 2, totalPages: 1 },
          },
        })
      }),
      http.post('*/api/v1/members/admin/channels/101/approve', () =>
        HttpResponse.json(
          {
            status: 409,
            code: 'CHANNEL_REVIEW_NOT_ALLOWED',
            detail: '심사 대기 중인 채널만 승인·반려할 수 있습니다.',
          },
          { status: 409 },
        ),
      ),
    )
    renderApp('/admin/channels', 'ADMIN')
    const row = await item('새벽기타')
    const before = listCalls
    await userEvent.click(within(row).getByRole('button', { name: '승인' }))
    const dialog = screen.getByRole('dialog', { name: '이 채널을 승인할까요?' })
    await userEvent.click(within(dialog).getByRole('button', { name: '승인' }))

    expect(
      await screen.findByText(
        '이미 처리된 채널이에요. 목록을 새로 불러왔어요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(listCalls).toBeGreaterThan(before))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('등록하자마자 자동 승인된 채널(신청일 없음)도 승인 탭에 자동 승인으로 보인다', async () => {
    renderApp('/admin/channels?status=APPROVED', 'ADMIN')
    const auto = await item('별빛')
    expect(within(auto).getByText(/자동 승인/)).toBeInTheDocument()
    expect(within(auto).queryByText(/신청/)).toBeNull()
    const reviewed = await item('하루')
    expect(within(reviewed).getByText(/신청 · .+ 처리/)).toBeInTheDocument()
  })

  it('반려가 일시적으로 실패하면 모달과 입력한 사유를 그대로 둔다', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    server.use(
      http.post('*/api/v1/members/admin/channels/101/reject', () =>
        HttpResponse.json(
          { status: 500, code: 'INTERNAL_ERROR', detail: '잠시 실패했어요.' },
          { status: 500 },
        ),
      ),
    )
    renderApp('/admin/channels', 'ADMIN')
    const row = await item('새벽기타')
    await userEvent.click(within(row).getByRole('button', { name: '반려' }))
    const dialog = screen.getByRole('dialog', { name: '이 채널을 반려할까요?' })
    await userEvent.type(
      within(dialog).getByLabelText('반려 사유'),
      '직접 쓴 사유',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: '반려' }))

    expect(await screen.findByText('잠시 실패했어요.')).toBeInTheDocument()
    const still = screen.getByRole('dialog', { name: '이 채널을 반려할까요?' })
    expect(within(still).getByLabelText('반려 사유')).toHaveValue(
      '직접 쓴 사유',
    )
  })

  it('처리 중에는 모달을 닫고 다시 열어도 같은 채널을 또 보내지 못한다', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let approveCalls = 0
    server.use(
      http.post('*/api/v1/members/admin/channels/101/approve', async () => {
        approveCalls++
        await gate
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/admin/channels', 'ADMIN')
    const row = await item('새벽기타')
    await userEvent.click(within(row).getByRole('button', { name: '승인' }))
    const dialog = screen.getByRole('dialog', { name: '이 채널을 승인할까요?' })
    await userEvent.click(within(dialog).getByRole('button', { name: '승인' }))
    await waitFor(() => expect(approveCalls).toBe(1))

    // 응답 전에 모달을 닫으면 심사 버튼이 막혀 있다.
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(row).getByRole('button', { name: '승인' })).toBeDisabled()
    expect(within(row).getByRole('button', { name: '반려' })).toBeDisabled()

    release()
    expect(
      await screen.findByText(
        '채널을 승인했어요. 유저였다면 인플루언서가 돼요.',
      ),
    ).toBeInTheDocument()
    expect(approveCalls).toBe(1)
  })

  it('상태 탭을 바꾸면 새 목록이 올 때까지 이전 탭의 행과 심사 버튼을 보이지 않는다', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      http.get('*/api/v1/members/admin/channels', async ({ request }) => {
        const status = new URL(request.url).searchParams.get('status')
        if (status === 'REJECTED') await gate
        return HttpResponse.json({
          statusCode: 200,
          message: '',
          data: {
            content: memberDb.channels.filter((c) => c.status === status),
            page: { size: 10, number: 0, totalElements: 1, totalPages: 1 },
          },
        })
      }),
    )
    renderApp('/admin/channels', 'ADMIN')
    await item('새벽기타')
    const tabs = screen.getByRole('group', { name: '심사 상태' })
    const rejectedTab = within(tabs).getByRole('button', { name: '반려' })
    await userEvent.click(rejectedTab)
    // 주소 변경은 비동기로 반영된다. 반려 탭이 눌린 화면이 그려질 때까지 기다린다.
    await waitFor(() =>
      expect(rejectedTab).toHaveAttribute('aria-pressed', 'true'),
    )

    // 응답 전: 대기 탭의 행과 승인 버튼이 남지 않는다.
    expect(
      screen.queryByRole('listitem', { name: '새벽기타의 채널 인증 신청' }),
    ).toBeNull()
    // (상태 탭에도 '승인' 버튼이 있으므로 목록 자체가 없는지 본다)
    expect(screen.queryByRole('list', { name: '채널 심사 목록' })).toBeNull()
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument()

    release()
    expect(await item('노을')).toBeInTheDocument()
  })

  it('관리자가 아니면 열 수 없다', async () => {
    renderApp('/admin/channels', 'VERIFIED_INFLUENCER')
    expect(await screen.findByText(/권한|볼 수 없/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '채널 인증 심사' })).toBeNull()
  })
})
