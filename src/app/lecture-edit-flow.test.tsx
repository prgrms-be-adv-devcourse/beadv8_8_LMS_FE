import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type {
  LectureContentInput,
  LectureDetail,
  LectureInfoUpdateInput,
} from '@/entities/lecture/types'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const EDIT_PATH = '/studio/lectures/7/edit'

afterEach(() => {
  queryClient.clear()
  vi.restoreAllMocks()
})

/** 판매자 본인이 보는 상세. 파일 ID가 들어 있다(BE D53). */
const detail = (overrides: Partial<LectureDetail> = {}): LectureDetail => ({
  lectureId: 7,
  sellerUserId: ME_ID,
  sellerNickname: '하늘',
  title: '통기타 라이브 세팅',
  description: '픽업·마이크 두 채널로 깔끔하게',
  priceHp: 16000,
  thumbnailUrl: 'https://cdn.test/thumb.png',
  thumbnailFileId: 31,
  status: 'ON_SALE',
  rejectionReason: null,
  deleted: false,
  averageRating: null,
  reviewCount: 0,
  contents: [
    {
      contentId: 101,
      fileId: 11,
      title: '장비 고르기',
      sequence: 1,
      contentType: 'VIDEO',
    },
    {
      contentId: 102,
      fileId: 12,
      title: '체크리스트',
      sequence: 2,
      contentType: 'DOCUMENT',
    },
  ],
  createdAt: '2026-10-01T10:00:00',
  ...overrides,
})

const rejected = (overrides: Partial<LectureDetail> = {}) =>
  detail({
    status: 'REJECTED',
    rejectionReason: '2강 자료가 소개와 달라요.',
    ...overrides,
  })

const page = <T,>(content: T[]) => ({
  content,
  page: { size: 20, number: 0, totalElements: content.length, totalPages: 1 },
})

type Step = 'PATCH' | 'PUT' | 'POST'

/**
 * 수정 화면이 부르는 API. 상세는 함수를 넘기면 호출마다 다시 만든다(저장 뒤 재조회 확인용).
 * fail에 적은 단계는 그 응답을 한 번 돌려주고 이후에는 204다.
 */
function serveEdit(
  lecture: LectureDetail | (() => LectureDetail),
  fail: Partial<Record<Step, () => Response>> = {},
) {
  const calls: Step[] = []
  const patches: LectureInfoUpdateInput[] = []
  const puts: { contents: LectureContentInput[] }[] = []
  const gets = { detail: 0, mine: 0 }
  const ok = () => new HttpResponse(null, { status: 204 })
  const respond = (step: Step) => {
    calls.push(step)
    const failure = fail[step]
    if (failure) {
      delete fail[step]
      return failure()
    }
    return ok()
  }
  server.use(
    http.get('*/api/v1/lectures/7', () => {
      gets.detail += 1
      return rs(typeof lecture === 'function' ? lecture() : lecture)
    }),
    http.patch('*/api/v1/lectures/7', async ({ request }) => {
      patches.push((await request.json()) as LectureInfoUpdateInput)
      return respond('PATCH')
    }),
    http.put('*/api/v1/lectures/7/contents', async ({ request }) => {
      puts.push((await request.json()) as { contents: LectureContentInput[] })
      return respond('PUT')
    }),
    http.post('*/api/v1/lectures/7/inspection-requests', () => respond('POST')),
    http.get('*/api/v1/lectures/me', () => {
      gets.mine += 1
      return rs(page([]))
    }),
    http.get('*/api/v1/lectures/sales', () => rs(page([]))),
  )
  return { calls, patches, puts, gets }
}

const problem = (status: number, code: string, detail: string) =>
  HttpResponse.json({ status, code, detail }, { status })

/** n번째 강 행 */
const lesson = (n: number) => screen.getByRole('group', { name: `${n}강` })

function openEdit(path = EDIT_PATH) {
  document.cookie = 'XSRF-TOKEN=t'
  return renderApp(path, 'VERIFIED_INFLUENCER')
}

describe('강의 수정 · 기본 정보', () => {
  it('판매 중 강의의 수정 화면은 기존 값을 채우고 강의 내용은 읽기 전용으로 둔다', async () => {
    serveEdit(detail())
    openEdit()

    expect(await screen.findByLabelText('강의 제목')).toHaveValue(
      '통기타 라이브 세팅',
    )
    expect(screen.getByLabelText('상세 소개')).toHaveValue(
      '픽업·마이크 두 채널로 깔끔하게',
    )
    expect(screen.getByLabelText('가격 (HP)')).toHaveValue('16000')
    expect(screen.getByRole('button', { name: '이미지 바꾸기' })).toBeVisible()
    expect(document.querySelector('aside img')).toHaveAttribute(
      'src',
      'https://cdn.test/thumb.png',
    )

    const first = lesson(1)
    expect(within(first).getByText('장비 고르기')).toBeVisible()
    expect(within(first).queryByRole('textbox')).not.toBeInTheDocument()
    expect(
      within(first).queryByRole('button', { name: /파일/ }),
    ).not.toBeInTheDocument()
    expect(
      within(first).getByRole('button', { name: '미리보기' }),
    ).toBeVisible()
    expect(within(lesson(2)).getByText('자료 · 올린 파일')).toBeVisible()
    expect(screen.queryByRole('button', { name: '강 추가' })).toBeNull()
    expect(screen.getByText('바꿀 수 없음')).toHaveClass('pill', 'mute')
    expect(
      screen.getByText(
        '판매 중인 강의의 영상·자료는 바꿀 수 없어요. 삭제한 뒤 다시 등록해 주세요.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByText('바뀐 내용이 없어요.')).toBeVisible()
  })

  it('검수 대기 강의는 검수 대기 안내 문구를 보여 준다', async () => {
    serveEdit(detail({ status: 'PENDING_INSPECTION' }))
    openEdit()

    expect(
      await screen.findByText(
        '검수 대기 중인 강의의 영상·자료는 바꿀 수 없어요. 검수 결과를 기다려 주세요.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  it('제목만 고쳐 저장하면 PATCH에 썸네일 ID를 그대로 보내고 토스트 뒤 /studio로 간다', async () => {
    const { calls, patches, gets } = serveEdit(detail())
    const router = openEdit()

    const title = await screen.findByLabelText('강의 제목')
    await userEvent.type(title, ' 2기')
    expect(
      screen.getByText('제목·소개·가격·썸네일만 바뀌어 재검수 없이 반영돼요.'),
    ).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('저장했어요. 바로 반영돼요.')).toBeVisible()
    await waitFor(() => expect(router.state.location.pathname).toBe('/studio'))
    expect(calls).toEqual(['PATCH'])
    expect(patches).toEqual([
      {
        title: '통기타 라이브 세팅 2기',
        description: '픽업·마이크 두 채널로 깔끔하게',
        priceHp: 16000,
        thumbnailFileId: 31,
      },
    ])
    // 강의 판매 화면의 내 강의 목록을 다시 불러온다.
    await waitFor(() => expect(gets.mine).toBeGreaterThan(0))
  })

  it('썸네일을 빼고 저장하면 thumbnailFileId를 null로 보내고, 소개를 비웠다 되돌리면 저장을 막는다', async () => {
    const { patches } = serveEdit(detail())
    openEdit()

    const description = await screen.findByLabelText('상세 소개')
    await userEvent.clear(description)
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
    await userEvent.type(description, '픽업·마이크 두 채널로 깔끔하게')
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: '빼기' }))
    expect(document.querySelector('aside img')).toBeNull()
    expect(screen.getByRole('button', { name: '이미지 올리기' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].thumbnailFileId).toBeNull()
  })
})

/** 파일 등록·본문 업로드 응답. fileId는 7부터 하나씩 늘린다. */
function mockUpload() {
  let nextId = 7
  server.use(
    http.post('*/api/v1/lectures/files', () => rs({ fileId: nextId++ }, 201)),
    http.put('*/api/v1/lectures/files/:fileId/content', async ({ request }) => {
      await request.arrayBuffer()
      return new HttpResponse(null, { status: 204 })
    }),
  )
}

const mp4 = (name = 'a.mp4') =>
  new File(['video-bytes'], name, { type: 'video/mp4' })

/** n강에 새 파일을 올리고 업로드가 끝날 때까지 기다린다 */
async function replaceFile(n: number, file: File) {
  await userEvent.upload(screen.getByLabelText(`${n}강 파일`), file, {
    applyAccept: false,
  })
  expect(
    await within(lesson(n)).findByText(
      new RegExp(file.name.replace('.', '\\.')),
    ),
  ).toBeVisible()
}

const resubmit = () =>
  screen.getByRole('button', { name: '수정 후 재검수 신청' })

describe('강의 수정 · 반려 강의 재검수', () => {
  it('반려 강의는 반려 사유를 보여 주고 한 강만 바꿔 재검수를 신청하면 PUT과 POST만 순서대로 보낸다', async () => {
    mockUpload()
    const { calls, puts, patches } = serveEdit(rejected())
    const router = openEdit()

    const reason = await screen.findByText('2강 자료가 소개와 달라요.')
    expect(reason.closest('.notice')).toHaveClass('warn')
    expect(resubmit()).toBeEnabled()
    expect(within(lesson(2)).getByText('자료 · 올린 파일')).toBeVisible()
    expect(
      within(lesson(2)).getByRole('button', { name: '파일 교체' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: '강 추가' })).toBeVisible()

    await replaceFile(2, mp4('fixed.mp4'))
    await userEvent.click(resubmit())

    expect(
      await screen.findByText('저장하고 재검수를 신청했어요.'),
    ).toBeVisible()
    await waitFor(() => expect(router.state.location.pathname).toBe('/studio'))
    expect(calls).toEqual(['PUT', 'POST'])
    expect(patches).toHaveLength(0)
    expect(puts).toEqual([
      {
        contents: [
          { fileId: 11, title: '장비 고르기', contentType: 'VIDEO' },
          { fileId: 7, title: '체크리스트', contentType: 'VIDEO' },
        ],
      },
    ])
  })

  it('반려 강의의 기본 정보와 강을 함께 고치면 PATCH → PUT → POST 순서로 보낸다', async () => {
    mockUpload()
    const { calls, puts, patches } = serveEdit(rejected())
    openEdit()

    await userEvent.clear(await screen.findByLabelText('가격 (HP)'))
    await userEvent.type(screen.getByLabelText('가격 (HP)'), '20000')
    await userEvent.click(
      within(lesson(2)).getByRole('button', { name: '위로' }),
    )
    await userEvent.click(screen.getByRole('button', { name: '강 추가' }))
    await userEvent.type(
      within(lesson(3)).getByRole('textbox', { name: '3강 제목' }),
      '마무리',
    )
    await replaceFile(3, mp4('end.mp4'))
    await userEvent.click(resubmit())

    await waitFor(() => expect(calls).toEqual(['PATCH', 'PUT', 'POST']))
    expect(patches[0]).toMatchObject({ priceHp: 20000, thumbnailFileId: 31 })
    expect(puts[0].contents).toEqual([
      { fileId: 12, title: '체크리스트', contentType: 'DOCUMENT' },
      { fileId: 11, title: '장비 고르기', contentType: 'VIDEO' },
      { fileId: 7, title: '마무리', contentType: 'VIDEO' },
    ])
  })

  it('바뀐 것이 없어도 재검수 신청을 보낼 수 있다', async () => {
    const { calls } = serveEdit(rejected())
    openEdit()

    await userEvent.click(
      await screen.findByRole('button', {
        name: '수정 후 재검수 신청',
      }),
    )

    expect(
      await screen.findByText('저장하고 재검수를 신청했어요.'),
    ).toBeVisible()
    expect(calls).toEqual(['POST'])
  })

  it('콘텐츠 교체가 실패하면 기본 정보는 저장됐다고 알리고 상세를 다시 불러온다', async () => {
    mockUpload()
    // 첫 조회는 반려 상세, PATCH 뒤 재조회는 새 제목이 반영된 상세다.
    let saved = rejected()
    const { calls, gets } = serveEdit(() => saved, {
      PUT: () =>
        problem(
          409,
          'CONTENT_NOT_EDITABLE',
          '반려된 강의만 영상·자료를 수정할 수 있습니다.',
        ),
    })
    server.use(
      http.patch('*/api/v1/lectures/7', async ({ request }) => {
        const body = (await request.json()) as LectureInfoUpdateInput
        saved = rejected({ title: body.title })
        calls.push('PATCH')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const router = openEdit()

    await userEvent.type(await screen.findByLabelText('강의 제목'), ' 2기')
    await replaceFile(1, mp4())
    await userEvent.click(resubmit())

    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(
      '기본 정보는 저장했지만 강의 내용은 저장하지 못했어요. 반려된 강의만 영상·자료를 수정할 수 있습니다.',
    )
    expect(banner).toHaveClass('notice', 'bad')
    expect(calls).toEqual(['PATCH', 'PUT'])
    await waitFor(() => expect(gets.detail).toBe(2))
    expect(router.state.location.pathname).toBe(EDIT_PATH)
    expect(screen.getByLabelText('강의 제목')).toHaveValue(
      '통기타 라이브 세팅 2기',
    )
    expect(within(lesson(1)).getByText(/a\.mp4/)).toBeVisible()
  })

  it('재검수 신청만 실패하면 알린 뒤 다시 누르면 POST만 보낸다', async () => {
    const { calls, patches } = serveEdit(
      () => rejected({ title: patches.at(-1)?.title ?? '통기타 라이브 세팅' }),
      { POST: () => problem(500, 'INTERNAL_ERROR', '서버 오류') },
    )
    openEdit()

    await userEvent.type(await screen.findByLabelText('강의 제목'), ' 2기')
    await userEvent.click(resubmit())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '저장은 됐지만 재검수 신청이 안 됐어요. 다시 신청해 주세요. 서버 오류',
    )
    expect(calls).toEqual(['PATCH', 'POST'])

    await userEvent.click(resubmit())
    expect(
      await screen.findByText('저장하고 재검수를 신청했어요.'),
    ).toBeVisible()
    expect(calls).toEqual(['PATCH', 'POST', 'POST'])
  })
})

/** 판매자용 시청 URL 발급. 요청한 contentId를 모아 돌려준다 */
function serveAccess() {
  const requested: number[] = []
  server.use(
    http.get('*/api/v1/lectures/7/contents/:contentId/access', ({ params }) => {
      requested.push(Number(params.contentId))
      return rs({
        url: `https://s3.test/${params.contentId}.mp4?sig=1`,
        expiresAt: '2026-10-15T11:00:00',
      })
    }),
  )
  return requested
}

describe('강의 수정 · 미리보기와 안내', () => {
  it('수정 화면에서 미리보기를 누르면 판매자용 시청 URL로 영상을 열고, 새 파일을 올린 강은 미리볼 수 없다', async () => {
    mockUpload()
    serveEdit(rejected())
    const requested = serveAccess()
    openEdit()

    await userEvent.click(
      within(await screen.findByRole('group', { name: '1강' })).getByRole(
        'button',
        { name: '미리보기' },
      ),
    )
    const dialog = await screen.findByRole('dialog', { name: '01 장비 고르기' })
    await waitFor(() =>
      expect(dialog.querySelector('video')).toHaveAttribute(
        'src',
        'https://s3.test/101.mp4?sig=1',
      ),
    )
    expect(requested).toEqual([101])
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await replaceFile(1, mp4())
    expect(
      within(lesson(1)).queryByRole('button', { name: '미리보기' }),
    ).not.toBeInTheDocument()
  })

  it('삭제된 강의나 내 강의가 아니면 안내만 보여 주고 폼을 열지 않는다', async () => {
    serveEdit(detail({ deleted: true }))
    openEdit()

    expect(
      await screen.findByText('삭제한 강의는 수정할 수 없어요'),
    ).toBeVisible()
    expect(screen.getByText('삭제됨')).toHaveClass('pill', 'mute')
    expect(
      screen.getByText(
        '기존 구매자는 계속 볼 수 있어요. 다시 판매하려면 새로 등록해 주세요.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: '강의 판매로' })).toHaveAttribute(
      'href',
      '/studio',
    )
    expect(screen.queryByLabelText('강의 제목')).not.toBeInTheDocument()

    queryClient.clear()
    serveEdit(
      detail({
        sellerUserId: 99,
        thumbnailFileId: null,
        contents: detail().contents.map((c) => ({ ...c, fileId: null })),
      }),
    )
    openEdit()
    expect(await screen.findByText('내 강의만 수정할 수 있어요')).toBeVisible()
    expect(screen.queryByLabelText('강의 제목')).not.toBeInTheDocument()
  })
})

describe('판매자 시점 강의 상세', () => {
  function serveDetail(lecture: LectureDetail) {
    server.use(
      http.get('*/api/v1/lectures/7', () => rs(lecture)),
      http.get('*/api/v1/lectures/7/reviews', () => rs(page([]))),
      http.get('*/api/v1/lectures/cart', () =>
        rs({ items: [], purchasableTotalHp: 0 }),
      ),
      http.get('*/api/v1/lectures/purchased', () => rs(page([]))),
    )
  }

  it('판매자가 자기 강의 상세를 보면 상태 Pill과 수정 버튼, 미리보기를 보여 준다', async () => {
    serveDetail(rejected())
    const requested = serveAccess()
    renderApp('/lectures/7', 'VERIFIED_INFLUENCER')

    expect(await screen.findByText('반려')).toHaveClass('pill', 'bad')
    expect(screen.getByText('2강 자료가 소개와 달라요.')).toBeVisible()
    expect(
      screen.getByRole('link', { name: '수정 후 재검수' }),
    ).toHaveAttribute('href', '/studio/lectures/7/edit')
    expect(
      screen.queryByRole('button', { name: '바로 구매' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        '내가 판매하는 강의는 장바구니에 담거나 살 수 없어요.',
      ),
    ).not.toBeInTheDocument()

    await userEvent.click(
      screen.getAllByRole('button', { name: '미리보기' })[1],
    )
    expect(
      await screen.findByRole('dialog', { name: '02 체크리스트' }),
    ).toBeVisible()
    await waitFor(() => expect(requested).toEqual([102]))
  })

  it('삭제한 강의는 삭제됨 Pill만 보여 주고 수정 버튼을 두지 않는다', async () => {
    serveDetail(detail({ deleted: true }))
    renderApp('/lectures/7', 'VERIFIED_INFLUENCER')

    expect(await screen.findByText('삭제됨')).toHaveClass('pill', 'mute')
    expect(screen.queryByRole('link', { name: '수정' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '미리보기' })).toHaveLength(2)
  })
})
