import { useState, type FormEvent } from 'react'
import {
  canEditContents,
  readOnlyContentsNotice,
} from '@/entities/lecture/edit'
import { contentTypeOf, priceError, TITLE_MAX } from '@/entities/lecture/rules'
import type {
  LectureContent,
  LectureContentInput,
  LectureDetail,
  LectureInfoUpdateInput,
} from '@/entities/lecture/types'
import { LectureThumb } from '@/entities/lecture/ui/LectureThumb'
import { isApiError } from '@/shared/api/ApiError'
import { formatNumber } from '@/shared/lib/money'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import { Field } from '@/shared/ui/Field'
import { LessonList, type Lesson } from './LessonList'
import { ThumbnailPicker } from './ThumbnailPicker'
import { UploadLeaveGuard } from './UploadLeaveGuard'
import { useObjectUrl } from './useObjectUrl'
import { THUMB_KEY, useUploads } from './useUploads'

let lessonSeq = 0
const newLesson = (): Lesson => ({ key: `lesson-${++lessonSeq}`, title: '' })

/** 수정할 강의의 콘텐츠를 강 순서대로 강 목록으로 만든다 */
function lessonsOf(lecture: LectureDetail): Lesson[] {
  return [...lecture.contents]
    .sort((a, b) => a.sequence - b.sequence)
    .map((c) => ({
      key: `lesson-${++lessonSeq}`,
      title: c.title,
      current:
        c.fileId === null
          ? undefined
          : { fileId: c.fileId, contentType: c.contentType },
    }))
}

/** 폼이 넘기는 값. 수정이면 changed로 바뀐 부분만 보낸다 */
export type LectureEditorValue = {
  info: LectureInfoUpdateInput
  contents: LectureContentInput[]
  changed: { info: boolean; contents: boolean }
}

/** 기본 정보 칸 (서버 필드 이름 → 입력칸 id), 화면 순서대로 */
const FIELD_ID = { title: 'le-title', priceHp: 'le-price' } as const
const FIELD_ORDER = ['title', 'priceHp'] as const

type ServerErrors = {
  /** 기본 정보 칸 오류 (서버 필드 이름 기준) */
  fields: { field: string; message: string }[]
  lessons: Record<string, string | undefined>
  /** 칸에 붙일 수 없는 오류 (파일 오류, 중간 실패 안내 등) */
  form?: string
}

const NO_ERRORS: ServerErrors = { fields: [], lessons: {} }

type LectureEditorFormProps = {
  /** 수정할 강의. 없으면 등록 폼이다 */
  lecture?: LectureDetail
  /** 검수 신청·저장. 실패하면 오류를 칸 아래와 안내 영역에 나눠 보여 준다 */
  onSubmit: (value: LectureEditorValue) => Promise<unknown>
  /** 저장된 강 미리보기(수정). 판매자용 시청 URL을 연다 */
  onPreview?: (content: LectureContent) => void
}

/**
 * 강의 등록·수정 폼. 기본 정보, 강 목록, 오른쪽 미리보기로 이루어진다(목업 LectureEditScreen).
 * 수정이면 기존 값을 채우고, "바뀐 것"은 항상 최신 lecture와 비교한다(중간 실패 뒤 다시 불러와도 입력은 유지).
 * 강의 내용은 반려된 강의만 바꿀 수 있다(BE D11).
 */
export function LectureEditorForm({
  lecture,
  onSubmit,
  onPreview,
}: LectureEditorFormProps) {
  const [title, setTitle] = useState(lecture?.title ?? '')
  const [description, setDescription] = useState(lecture?.description ?? '')
  const [price, setPrice] = useState(
    lecture ? String(lecture.priceHp) : '10000',
  )
  const [lessons, setLessons] = useState<Lesson[]>(() =>
    lecture ? lessonsOf(lecture) : [newLesson()],
  )
  const [thumbRemoved, setThumbRemoved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverErrors, setServerErrors] = useState<ServerErrors>(NO_ERRORS)
  const uploads = useUploads()

  const editing = !!lecture
  const contentsEditable = !lecture || canEditContents(lecture)
  const rejected = !!lecture && canEditContents(lecture)

  const priceHp = Number(price) || 0
  const fields = useFieldErrors({
    ids: FIELD_ID,
    order: FIELD_ORDER,
    errors: {
      title: !title.trim() ? '강의 제목을 입력해 주세요.' : undefined,
      priceHp: priceError(priceHp) ?? undefined,
    },
  })
  const thumb = uploads.get(THUMB_KEY).upload
  const currentThumb =
    lecture && !thumbRemoved && lecture.thumbnailFileId !== null
      ? { fileId: lecture.thumbnailFileId, url: lecture.thumbnailUrl }
      : undefined
  const thumbnailFileId =
    thumb?.status === 'done' ? thumb.fileId : (currentThumb?.fileId ?? null)
  const newThumbUrl = useObjectUrl(
    thumb?.status === 'done' ? thumb.file : undefined,
  )
  const thumbUrl = newThumbUrl ?? currentThumb?.url ?? null

  const contents = lessons.map((lesson): LectureContentInput | null => {
    const lessonTitle = lesson.title.trim()
    if (!lessonTitle) return null
    const upload = uploads.get(lesson.key).upload
    if (upload?.status === 'done')
      return {
        fileId: upload.fileId,
        title: lessonTitle,
        contentType: contentTypeOf(upload.fileType),
      }
    if (lesson.current && upload?.status !== 'uploading')
      return { ...lesson.current, title: lessonTitle }
    return null
  })
  const ready =
    !fields.hasErrors &&
    lessons.length > 0 &&
    contents.every((c) => c !== null) &&
    (!thumb || thumb.status === 'done')

  const info: LectureInfoUpdateInput = {
    title: title.trim(),
    description: description.trim() || null,
    priceHp,
    thumbnailFileId,
  }
  const changed = {
    info: !lecture || infoChanged(info, lecture),
    contents: !lecture || contentsChanged(contents, lecture),
  }
  const canSubmit =
    ready && !submitting && (!editing || rejected || changed.info)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting || fields.blockSubmit() || !canSubmit) return
    setSubmitting(true)
    setServerErrors(NO_ERRORS)
    try {
      await onSubmit({
        info,
        contents: contents.filter((c) => c !== null),
        changed,
      })
    } catch (error) {
      const next = toServerErrors(error, lessons)
      setServerErrors(next)
      fields.showServerErrors(next.fields)
      if (Object.keys(next.lessons).length > 0) fields.focusInvalid()
    } finally {
      setSubmitting(false)
    }
  }

  const clearLessonError = (key: string) =>
    setServerErrors((prev) => ({
      ...prev,
      lessons: { ...prev.lessons, [key]: undefined },
    }))

  /** 강에 연결된 저장된 콘텐츠. 새 파일을 올렸으면 저장 전이라 미리볼 수 없다 */
  const savedContentOf = (lesson: Lesson) =>
    lesson.current && uploads.get(lesson.key).upload?.status !== 'done'
      ? lecture?.contents.find((c) => c.fileId === lesson.current?.fileId)
      : undefined

  const submitLabel = !editing
    ? '검수 신청'
    : rejected
      ? '수정 후 재검수 신청'
      : '저장'

  return (
    <form {...fields.formProps} className="split" noValidate onSubmit={submit}>
      <div className="page" style={{ gap: 16 }}>
        <section className="panel form">
          <div className="panel-head">
            <h2>기본 정보</h2>
            {editing && <span className="pill ok">수정해도 바로 반영</span>}
          </div>
          <Field id="le-title" label="강의 제목" error={fields.error('title')}>
            <input
              {...fields.inputProps('title')}
              className="input"
              value={title}
              maxLength={TITLE_MAX}
              placeholder="예: 통기타 라이브 세팅"
              onChange={(e) => {
                setTitle(e.target.value)
                fields.changed('title')
              }}
            />
          </Field>
          <Field
            id="le-desc"
            label="상세 소개"
            hint="소개와 실제 내용이 다르면 구매자가 30일 안에 이의 제기할 수 있어요."
          >
            <textarea
              id="le-desc"
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field
            id="le-price"
            label="가격 (HP)"
            error={fields.error('priceHp')}
          >
            <input
              {...fields.inputProps('priceHp')}
              className="input num"
              inputMode="numeric"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value.replace(/\D/g, ''))
                fields.changed('priceHp')
              }}
            />
          </Field>
          <ThumbnailPicker
            uploads={uploads}
            hasCurrent={!!currentThumb}
            onRemoveCurrent={() => setThumbRemoved(true)}
          />
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>강의 내용</h2>
            {contentsEditable ? (
              <span className="fine num">{lessons.length}강</span>
            ) : (
              <span className="pill mute">바꿀 수 없음</span>
            )}
          </div>
          {lecture && !contentsEditable && (
            <div className="notice">
              {readOnlyContentsNotice(lecture.status)}
            </div>
          )}
          <LessonList
            lessons={lessons}
            uploads={uploads}
            titleErrors={serverErrors.lessons}
            readOnly={!contentsEditable}
            savedContentOf={savedContentOf}
            onPreview={onPreview}
            onTitle={(key, value) => {
              clearLessonError(key)
              setLessons((prev) =>
                prev.map((l) => (l.key === key ? { ...l, title: value } : l)),
              )
            }}
            onMove={(index, by) =>
              setLessons((prev) => {
                const next = [...prev]
                ;[next[index], next[index + by]] = [
                  next[index + by],
                  next[index],
                ]
                return next
              })
            }
            onRemove={(key) => {
              uploads.remove(key)
              clearLessonError(key)
              setLessons((prev) => prev.filter((l) => l.key !== key))
            }}
          />
          {contentsEditable && (
            <button
              type="button"
              className="btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setLessons((prev) => [...prev, newLesson()])}
            >
              <span aria-hidden="true">+</span> 강 추가
            </button>
          )}
        </section>
      </div>

      <aside className="panel sticky">
        <LectureThumb
          lectureId={lecture?.lectureId ?? 0}
          title={title || '강의 제목'}
          thumbnailUrl={thumbUrl}
        />
        <b>{title || '강의 제목'}</b>
        <div className="big-price" style={{ fontSize: 22 }}>
          {formatNumber(priceHp)} HP
        </div>
        {!editing ? (
          <p className="fine">
            검수 신청하면 &apos;검수 대기&apos;(비공개)가 되고, 승인되면
            공개·판매가 시작돼요.
          </p>
        ) : rejected ? (
          <div className="notice warn">
            반려 사유를 고친 뒤 다시 검수를 신청해요.
          </div>
        ) : changed.info ? (
          <div className="notice">
            <span className="pill ok">바로 반영</span>
            제목·소개·가격·썸네일만 바뀌어 재검수 없이 반영돼요.
          </div>
        ) : (
          <p className="fine">바뀐 내용이 없어요.</p>
        )}
        {serverErrors.form && (
          <div className="notice bad" role="alert">
            {serverErrors.form}
          </div>
        )}
        <button
          type="submit"
          className="btn primary block"
          // 칸 검사 오류는 눌러서 첫 오류 칸을 안내하고, 그 밖의 이유(강 목록·업로드·바뀐 것 없음)는 그냥 막는다.
          disabled={submitting || (!fields.hasErrors && !canSubmit)}
          {...fields.submitProps}
        >
          {submitLabel}
        </button>
        {!ready && (
          <p className="fine">
            제목, 1,000 HP 단위 가격, 모든 강의 제목과 파일이 있어야 해요.
          </p>
        )}
      </aside>

      <UploadLeaveGuard active={uploads.uploading} />
    </form>
  )
}

function infoChanged(info: LectureInfoUpdateInput, lecture: LectureDetail) {
  return (
    info.title !== lecture.title ||
    info.description !== (lecture.description || null) ||
    info.priceHp !== lecture.priceHp ||
    info.thumbnailFileId !== lecture.thumbnailFileId
  )
}

/** 강 순서·제목·파일 중 하나라도 다르면 바뀐 것이다 */
function contentsChanged(
  contents: (LectureContentInput | null)[],
  lecture: LectureDetail,
) {
  const saved = [...lecture.contents]
    .sort((a, b) => a.sequence - b.sequence)
    .map((c) => [c.fileId, c.title, c.contentType])
  const draft = contents.map((c) =>
    c ? [c.fileId, c.title, c.contentType] : null,
  )
  return JSON.stringify(saved) !== JSON.stringify(draft)
}

const LESSON_TITLE_FIELD = /^contents\[(\d+)\]\.title$/

/** BE 오류를 칸별 오류와 안내 영역 오류로 나눈다 */
function toServerErrors(error: unknown, lessons: Lesson[]): ServerErrors {
  if (error instanceof Error && error.name === 'LectureSaveError')
    return { fields: [], lessons: {}, form: error.message }
  if (!isApiError(error))
    return {
      fields: [],
      lessons: {},
      form: '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
    }
  if (error.code === 'INVALID_PRICE')
    return {
      fields: [{ field: 'priceHp', message: error.message }],
      lessons: {},
    }

  const result: ServerErrors = { fields: [], lessons: {} }
  const rest: string[] = []
  for (const { field, message } of error.errors) {
    const lessonIndex = LESSON_TITLE_FIELD.exec(field)?.[1]
    if (field === 'title' || field === 'priceHp')
      result.fields.push({ field, message })
    else if (lessonIndex !== undefined && lessons[Number(lessonIndex)])
      result.lessons[lessons[Number(lessonIndex)].key] = message
    else rest.push(message)
  }
  if (error.errors.length === 0) result.form = error.message
  else if (rest.length > 0) result.form = rest.join(' ')
  return result
}
