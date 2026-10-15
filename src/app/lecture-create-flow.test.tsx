import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { lectureKeys } from '@/entities/lecture/api'
import type { LectureRegisterInput } from '@/entities/lecture/types'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const PATH = '/studio/lectures/new'

// 붙잡아 둔 응답은 테스트가 끝날 때 모두 풀어 준다(다음 테스트로 요청이 남지 않게).
const pending: (() => void)[] = []

afterEach(() => {
  pending.splice(0).forEach((release) => release())
  queryClient.clear()
  vi.restoreAllMocks()
})

/** 풀어 줄 때까지 응답을 미루는 약속 */
function hold() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  pending.push(release)
  return { promise, release }
}

const mp4 = (name = 'a.mp4') =>
  new File(['video-bytes'], name, { type: 'video/mp4' })

type Registered = {
  fileType: string
  originalFilename: string
  contentType: string
  fileSize: number
}

/** 파일 등록·본문 업로드 응답. fileId는 7부터 하나씩 늘린다. */
function mockUpload({ upload }: { upload?: () => Promise<void> } = {}) {
  const registered: Registered[] = []
  const puts: { fileId: number; headers: Headers }[] = []
  let nextId = 7
  server.use(
    http.post('*/api/v1/lectures/files', async ({ request }) => {
      registered.push((await request.json()) as Registered)
      return rs({ fileId: nextId++ }, 201)
    }),
    http.put(
      '*/api/v1/lectures/files/:fileId/content',
      async ({ request, params }) => {
        puts.push({ fileId: Number(params.fileId), headers: request.headers })
        await request.arrayBuffer()
        await upload?.()
        return new HttpResponse(null, { status: 204 })
      },
    ),
  )
  return { registered, puts }
}

/** 강의 등록 응답. 넘긴 응답을 차례로 쓰고, 다 쓰면 201 { id: 100 }을 준다. */
function mockCreate(...responses: (() => Response)[]) {
  const bodies: LectureRegisterInput[] = []
  server.use(
    http.post('*/api/v1/lectures', async ({ request }) => {
      bodies.push((await request.json()) as LectureRegisterInput)
      return responses.shift()?.() ?? rs({ id: 100 }, 201)
    }),
  )
  return bodies
}

const problem = (
  status: number,
  code: string,
  detail: string,
  errors?: { field: string; message: string }[],
) => HttpResponse.json({ status, code, detail, errors }, { status })

/** n강에 제목을 쓰고 파일을 올린 뒤 업로드가 끝날 때까지 기다린다 */
async function fillLesson(n: number, title: string, file: File) {
  await userEvent.type(
    within(lesson(n)).getByRole('textbox', { name: `${n}강 제목` }),
    title,
  )
  await userEvent.upload(screen.getByLabelText(`${n}강 파일`), file, {
    applyAccept: false,
  })
  expect(
    await within(lesson(n)).findByText(
      new RegExp(file.name.replace('.', '\\.')),
    ),
  ).toBeVisible()
}

const pdf = (name = 'b.pdf') =>
  new File(['pdf-bytes'], name, { type: 'application/pdf' })

const submitButton = () => screen.getByRole('button', { name: '검수 신청' })

/** n번째 강 행 */
const lesson = (n: number) => screen.getByRole('group', { name: `${n}강` })

function openForm() {
  document.cookie = 'XSRF-TOKEN=t'
  return renderApp(PATH, 'VERIFIED_INFLUENCER')
}

describe('강의 등록', () => {
  it('가격이 1,000 HP 미만이거나 1,000 단위가 아니면 바로 오류를 보여 주고 검수 신청을 막는다', async () => {
    openForm()
    const price = await screen.findByLabelText('가격 (HP)')
    const submit = screen.getByRole('button', { name: '검수 신청' })

    await userEvent.clear(price)
    await userEvent.type(price, '999')
    expect(screen.getByText('1,000 HP 이상으로 정해 주세요.')).toBeVisible()
    expect(submit).toBeDisabled()

    await userEvent.clear(price)
    await userEvent.type(price, '1500')
    expect(
      screen.getByText('1,000 HP 단위로 정해 주세요. 무료 강의는 없어요.'),
    ).toBeVisible()

    await userEvent.clear(price)
    await userEvent.type(price, '2,000')
    expect(price).toHaveValue('2000')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('2,000 HP')).toBeVisible()
  })

  it('강 파일을 고르면 파일 정보를 등록하고 CSRF 헤더와 함께 본문을 올리며 진행률을 보여 준다', async () => {
    const gate = hold()
    const { registered, puts } = mockUpload({ upload: () => gate.promise })
    openForm()

    await userEvent.upload(await screen.findByLabelText('1강 파일'), mp4(), {
      applyAccept: false,
    })

    expect(await within(lesson(1)).findByRole('progressbar')).toBeVisible()
    expect(within(lesson(1)).getByText(/올리는 중…/)).toBeVisible()
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(registered).toEqual([
      {
        fileType: 'LECTURE_VIDEO',
        originalFilename: 'a.mp4',
        contentType: 'video/mp4',
        fileSize: 11,
      },
    ])
    expect(puts[0].fileId).toBe(7)
    expect(puts[0].headers.get('x-xsrf-token')).toBe('t')
    expect(puts[0].headers.get('content-type')).toBe('video/mp4')

    gate.release()
    expect(await within(lesson(1)).findByText(/영상 · a\.mp4/)).toBeVisible()
    expect(within(lesson(1)).queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('형식이 다르거나 크기 제한을 넘는 파일은 요청 없이 거절한다', async () => {
    const { registered } = mockUpload()
    openForm()
    const lessonFile = await screen.findByLabelText('1강 파일')

    await userEvent.upload(
      lessonFile,
      new File(['x'], 'memo.txt', { type: 'text/plain' }),
      { applyAccept: false },
    )
    expect(
      within(lesson(1)).getByText('mp4 영상이나 pdf 자료만 올릴 수 있어요.'),
    ).toBeVisible()

    const huge = mp4('huge.mp4')
    Object.defineProperty(huge, 'size', { value: 2048 * 1024 * 1024 + 1 })
    await userEvent.upload(lessonFile, huge, { applyAccept: false })
    expect(
      within(lesson(1)).getByText('영상은 2GB까지 올릴 수 있어요.'),
    ).toBeVisible()

    await userEvent.upload(
      screen.getByLabelText('썸네일 파일'),
      new File(['gif'], 'a.gif', { type: 'image/gif' }),
      { applyAccept: false },
    )
    expect(
      screen.getByText('jpg·png·webp 이미지만 올릴 수 있어요.'),
    ).toBeVisible()
    expect(registered).toHaveLength(0)
  })

  it('file.type이 비어 있어도 확장자로 형식을 정해 올린다', async () => {
    const { registered, puts } = mockUpload()
    openForm()

    await userEvent.upload(
      await screen.findByLabelText('1강 파일'),
      new File(['pdf'], 'b.pdf', { type: '' }),
      { applyAccept: false },
    )

    expect(await within(lesson(1)).findByText(/자료 · b\.pdf/)).toBeVisible()
    expect(registered[0]).toMatchObject({
      fileType: 'LECTURE_DOCUMENT',
      contentType: 'application/pdf',
    })
    expect(puts[0].headers.get('content-type')).toBe('application/pdf')
  })

  it('업로드가 실패하면 문구를 보여 주고 다시 올리면 파일 정보 등록부터 새로 한다', async () => {
    let failed = false
    const { registered, puts } = mockUpload()
    server.use(
      http.put('*/api/v1/lectures/files/:fileId/content', async () => {
        if (failed) return
        failed = true
        return HttpResponse.json(
          { status: 400, code: 'FILE_SIZE_MISMATCH', detail: '크기가 달라요' },
          { status: 400 },
        )
      }),
    )
    openForm()

    await userEvent.upload(await screen.findByLabelText('1강 파일'), mp4(), {
      applyAccept: false,
    })
    expect(
      await within(lesson(1)).findByText(
        '파일이 올리는 중에 바뀌었어요. 다시 올려 주세요.',
      ),
    ).toBeVisible()

    await userEvent.click(
      within(lesson(1)).getByRole('button', { name: '다시 올리기' }),
    )

    expect(await within(lesson(1)).findByText(/영상 · a\.mp4/)).toBeVisible()
    expect(registered).toHaveLength(2)
    expect(puts.map((p) => p.fileId)).toEqual([8])
    expect(within(lesson(1)).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('강을 추가·삭제하고 순서를 바꾸면 등록 요청의 contents 순서에 반영된다', async () => {
    mockUpload()
    const bodies = mockCreate()
    openForm()
    await userEvent.type(await screen.findByLabelText('강의 제목'), '첫 방송')
    expect(
      within(lesson(1)).getByRole('button', { name: '삭제' }),
    ).toBeDisabled()

    await fillLesson(1, '장비 고르기', mp4())
    await userEvent.click(screen.getByRole('button', { name: '강 추가' }))
    await fillLesson(2, '체크리스트', pdf())
    await userEvent.click(screen.getByRole('button', { name: '강 추가' }))
    expect(screen.getByText('3강')).toBeVisible()
    await userEvent.click(
      within(lesson(3)).getByRole('button', { name: '삭제' }),
    )
    expect(screen.queryByRole('group', { name: '3강' })).not.toBeInTheDocument()

    await userEvent.click(
      within(lesson(2)).getByRole('button', { name: '위로' }),
    )
    expect(within(lesson(1)).getByRole('textbox')).toHaveValue('체크리스트')
    expect(
      within(lesson(1)).getByRole('button', { name: '위로' }),
    ).toBeDisabled()
    expect(
      within(lesson(2)).getByRole('button', { name: '아래로' }),
    ).toBeDisabled()

    await userEvent.click(submitButton())
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].contents).toEqual([
      { fileId: 8, title: '체크리스트', contentType: 'DOCUMENT' },
      { fileId: 7, title: '장비 고르기', contentType: 'VIDEO' },
    ])
  })

  it('제목·가격·모든 강의 제목과 업로드가 갖춰져야 검수 신청이 열리고, 성공하면 토스트 후 /studio로 간다', async () => {
    mockUpload()
    const bodies = mockCreate()
    const mineKey = [...lectureKeys.mine(), { page: 0 }]
    queryClient.setQueryData(mineKey, { content: [] })
    const router = openForm()

    await userEvent.type(
      await screen.findByLabelText('강의 제목'),
      '  첫 방송  ',
    )
    expect(submitButton()).toBeDisabled()
    expect(
      screen.getByText(
        '제목, 1,000 HP 단위 가격, 모든 강의 제목과 파일이 있어야 해요.',
      ),
    ).toBeVisible()

    await userEvent.upload(screen.getByLabelText('1강 파일'), mp4(), {
      applyAccept: false,
    })
    expect(await within(lesson(1)).findByText(/영상 · a\.mp4/)).toBeVisible()
    expect(submitButton()).toBeDisabled()

    await userEvent.type(
      within(lesson(1)).getByRole('textbox', { name: '1강 제목' }),
      '장비',
    )
    expect(submitButton()).toBeEnabled()

    await userEvent.clear(screen.getByLabelText('가격 (HP)'))
    expect(submitButton()).toBeDisabled()
    await userEvent.type(screen.getByLabelText('가격 (HP)'), '30000')

    await userEvent.click(submitButton())

    expect(
      await screen.findByText('검수를 신청했어요. 승인되면 공개돼요.'),
    ).toBeVisible()
    await waitFor(() => expect(router.state.location.pathname).toBe('/studio'))
    expect(bodies).toEqual([
      {
        title: '첫 방송',
        description: null,
        priceHp: 30000,
        thumbnailFileId: null,
        contents: [{ fileId: 7, title: '장비', contentType: 'VIDEO' }],
      },
    ])
    expect(queryClient.getQueryState(mineKey)?.isInvalidated).toBe(true)
  })

  it('썸네일을 올리면 미리보기에 보이고 등록 요청에 실린다', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:thumb')
    URL.revokeObjectURL = vi.fn()
    mockUpload()
    const bodies = mockCreate()
    openForm()

    await userEvent.upload(
      await screen.findByLabelText('썸네일 파일'),
      new File(['png'], 'thumb.png', { type: 'image/png' }),
      { applyAccept: false },
    )
    await waitFor(() =>
      expect(document.querySelector('aside img')).toHaveAttribute(
        'src',
        'blob:thumb',
      ),
    )
    expect(screen.getByRole('button', { name: '이미지 바꾸기' })).toBeVisible()

    await userEvent.type(screen.getByLabelText('강의 제목'), '첫 방송')
    await fillLesson(1, '장비', mp4())
    await userEvent.click(submitButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].thumbnailFileId).toBe(7)
  })

  it('썸네일을 빼면 기본 미리보기로 돌아가고 thumbnailFileId 없이 등록한다', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:thumb')
    URL.revokeObjectURL = vi.fn()
    mockUpload()
    const bodies = mockCreate()
    openForm()

    await userEvent.upload(
      await screen.findByLabelText('썸네일 파일'),
      new File(['png'], 'thumb.png', { type: 'image/png' }),
      { applyAccept: false },
    )
    await userEvent.click(await screen.findByRole('button', { name: '빼기' }))

    expect(document.querySelector('aside img')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:thumb')
    expect(screen.getByRole('button', { name: '이미지 올리기' })).toBeVisible()

    await userEvent.type(screen.getByLabelText('강의 제목'), '첫 방송')
    await fillLesson(1, '장비', mp4())
    await userEvent.click(submitButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].thumbnailFileId).toBeNull()
  })

  it('검수 신청이 실패하면 필드 오류는 칸 아래에, 그 밖의 오류는 안내 영역에 보여 준다', async () => {
    mockUpload()
    const bodies = mockCreate(
      () =>
        problem(400, 'INVALID_REQUEST', '요청 값이 올바르지 않아요.', [
          { field: 'contents[0].title', message: '강 제목을 입력해 주세요.' },
        ]),
      () => problem(400, 'INVALID_LECTURE_FILE', '첨부할 수 없는 파일이에요.'),
    )
    const router = openForm()
    await userEvent.type(await screen.findByLabelText('강의 제목'), '첫 방송')
    await fillLesson(1, '장비', mp4())

    await userEvent.click(submitButton())
    expect(
      await within(lesson(1)).findByText('강 제목을 입력해 주세요.'),
    ).toBeVisible()
    await userEvent.type(
      within(lesson(1)).getByRole('textbox', { name: '1강 제목' }),
      ' 고르기',
    )
    expect(
      within(lesson(1)).queryByText('강 제목을 입력해 주세요.'),
    ).not.toBeInTheDocument()

    await userEvent.click(submitButton())
    const banner = await screen.findByText('첨부할 수 없는 파일이에요.')
    expect(banner).toHaveClass('notice', 'bad')
    expect(bodies).toHaveLength(2)
    expect(bodies[1].contents[0].title).toBe('장비 고르기')
    expect(screen.getByLabelText('강의 제목')).toHaveValue('첫 방송')
    expect(router.state.location.pathname).toBe(PATH)
  })

  it('업로드 중에 다른 화면으로 가려 하면 경고하고, 나가면 업로드를 취소한다', async () => {
    const gate = hold()
    const { puts } = mockUpload({ upload: () => gate.promise })
    const abort = vi.spyOn(XMLHttpRequest.prototype, 'abort')
    const router = openForm()

    await userEvent.upload(await screen.findByLabelText('1강 파일'), mp4(), {
      applyAccept: false,
    })
    await waitFor(() => expect(puts).toHaveLength(1))

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)

    await userEvent.click(screen.getByRole('link', { name: '← 강의 판매' }))
    const dialog = await screen.findByRole('dialog', {
      name: '화면을 떠날까요?',
    })
    expect(
      within(dialog).getByText(
        '올리는 중인 파일이 있어요. 나가면 업로드가 취소돼요.',
      ),
    ).toBeVisible()
    await userEvent.click(
      within(dialog).getByRole('button', { name: '머무르기' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe(PATH)
    expect(abort).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('link', { name: '← 강의 판매' }))
    await userEvent.click(
      within(
        await screen.findByRole('dialog', { name: '화면을 떠날까요?' }),
      ).getByRole('button', { name: '나가기' }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/studio'))
    expect(abort).toHaveBeenCalledTimes(1)

    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })

  it('업로드 중에 강을 삭제하면 그 업로드를 취소한다', async () => {
    const gate = hold()
    let putCount = 0
    const { puts } = mockUpload({
      upload: () => (++putCount === 2 ? gate.promise : Promise.resolve()),
    })
    const abort = vi.spyOn(XMLHttpRequest.prototype, 'abort')
    const bodies = mockCreate()
    openForm()
    await userEvent.type(await screen.findByLabelText('강의 제목'), '첫 방송')
    await fillLesson(1, '장비', mp4())

    await userEvent.click(screen.getByRole('button', { name: '강 추가' }))
    await userEvent.upload(screen.getByLabelText('2강 파일'), pdf(), {
      applyAccept: false,
    })
    await waitFor(() => expect(puts).toHaveLength(2))
    expect(within(lesson(2)).getByRole('progressbar')).toBeVisible()

    await userEvent.click(
      within(lesson(2)).getByRole('button', { name: '삭제' }),
    )
    expect(abort).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('group', { name: '2강' })).not.toBeInTheDocument()

    await userEvent.click(submitButton())
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].contents).toEqual([
      { fileId: 7, title: '장비', contentType: 'VIDEO' },
    ])
  })
})
