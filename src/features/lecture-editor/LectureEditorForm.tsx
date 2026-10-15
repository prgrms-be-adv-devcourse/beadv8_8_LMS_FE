import { useState, type FormEvent } from 'react'
import { contentTypeOf, priceError, TITLE_MAX } from '@/entities/lecture/rules'
import type { LectureRegisterInput } from '@/entities/lecture/types'
import { LectureThumb } from '@/entities/lecture/ui/LectureThumb'
import { isApiError } from '@/shared/api/ApiError'
import { formatNumber } from '@/shared/lib/money'
import { Field } from '@/shared/ui/Field'
import { LessonList, type Lesson } from './LessonList'
import { ThumbnailPicker } from './ThumbnailPicker'
import { UploadLeaveGuard } from './UploadLeaveGuard'
import { useObjectUrl } from './useObjectUrl'
import { THUMB_KEY, useUploads } from './useUploads'

let lessonSeq = 0
const newLesson = (): Lesson => ({ key: `lesson-${++lessonSeq}`, title: '' })

type ServerErrors = {
  title?: string
  price?: string
  lessons: Record<string, string | undefined>
  /** 칸에 붙일 수 없는 오류 (파일 오류 등) */
  form?: string
}

const NO_ERRORS: ServerErrors = { lessons: {} }

type LectureEditorFormProps = {
  /** 검수 신청. 실패하면 오류를 칸 아래와 안내 영역에 나눠 보여 준다 */
  onSubmit: (input: LectureRegisterInput) => Promise<unknown>
}

/** 강의 등록 폼. 기본 정보, 강 목록, 오른쪽 미리보기로 이루어진다(목업 LectureEditScreen). */
export function LectureEditorForm({ onSubmit }: LectureEditorFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('10000')
  const [lessons, setLessons] = useState<Lesson[]>(() => [newLesson()])
  const [submitting, setSubmitting] = useState(false)
  const [serverErrors, setServerErrors] = useState<ServerErrors>(NO_ERRORS)
  const uploads = useUploads()

  const priceHp = Number(price) || 0
  const errPrice = priceError(priceHp)
  const thumb = uploads.get(THUMB_KEY).upload
  const thumbUrl = useObjectUrl(
    thumb?.status === 'done' ? thumb.file : undefined,
  )

  const contents = lessons.map((lesson) => {
    const upload = uploads.get(lesson.key).upload
    return upload?.status === 'done' && lesson.title.trim()
      ? {
          fileId: upload.fileId,
          title: lesson.title.trim(),
          contentType: contentTypeOf(upload.fileType),
        }
      : null
  })
  const ready =
    !!title.trim() &&
    !errPrice &&
    lessons.length > 0 &&
    contents.every((c) => c !== null) &&
    (!thumb || thumb.status === 'done')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready || submitting) return
    setSubmitting(true)
    setServerErrors(NO_ERRORS)
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        priceHp,
        thumbnailFileId: thumb?.status === 'done' ? thumb.fileId : null,
        contents: contents.filter((c) => c !== null),
      })
    } catch (error) {
      setServerErrors(toServerErrors(error, lessons))
    } finally {
      setSubmitting(false)
    }
  }

  const clearLessonError = (key: string) =>
    setServerErrors((prev) => ({
      ...prev,
      lessons: { ...prev.lessons, [key]: undefined },
    }))

  return (
    <form className="split" noValidate onSubmit={submit}>
      <div className="page" style={{ gap: 16 }}>
        <section className="panel form">
          <h2>기본 정보</h2>
          <Field id="le-title" label="강의 제목" error={serverErrors.title}>
            <input
              id="le-title"
              className="input"
              value={title}
              maxLength={TITLE_MAX}
              placeholder="예: 통기타 라이브 세팅"
              onChange={(e) => {
                setTitle(e.target.value)
                setServerErrors((prev) => ({ ...prev, title: undefined }))
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
            error={errPrice ?? serverErrors.price}
          >
            <input
              id="le-price"
              className="input num"
              inputMode="numeric"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value.replace(/\D/g, ''))
                setServerErrors((prev) => ({ ...prev, price: undefined }))
              }}
            />
          </Field>
          <ThumbnailPicker uploads={uploads} />
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>강의 내용</h2>
            <span className="fine num">{lessons.length}강</span>
          </div>
          <LessonList
            lessons={lessons}
            uploads={uploads}
            titleErrors={serverErrors.lessons}
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
          <button
            type="button"
            className="btn"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setLessons((prev) => [...prev, newLesson()])}
          >
            <span aria-hidden="true">+</span> 강 추가
          </button>
        </section>
      </div>

      <aside className="panel sticky">
        <LectureThumb
          lectureId={0}
          title={title || '강의 제목'}
          thumbnailUrl={thumbUrl}
        />
        <b>{title || '강의 제목'}</b>
        <div className="big-price" style={{ fontSize: 22 }}>
          {formatNumber(priceHp)} HP
        </div>
        <p className="fine">
          검수 신청하면 &apos;검수 대기&apos;(비공개)가 되고, 승인되면
          공개·판매가 시작돼요.
        </p>
        {serverErrors.form && (
          <div className="notice bad" role="alert">
            {serverErrors.form}
          </div>
        )}
        <button
          type="submit"
          className="btn primary block"
          disabled={!ready || submitting}
        >
          검수 신청
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

const LESSON_TITLE_FIELD = /^contents\[(\d+)\]\.title$/

/** BE 오류를 칸별 오류와 안내 영역 오류로 나눈다 */
function toServerErrors(error: unknown, lessons: Lesson[]): ServerErrors {
  if (!isApiError(error))
    return {
      lessons: {},
      form: '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
    }
  if (error.code === 'INVALID_PRICE')
    return { lessons: {}, price: error.message }

  const result: ServerErrors = { lessons: {} }
  const rest: string[] = []
  for (const { field, message } of error.errors) {
    const lessonIndex = LESSON_TITLE_FIELD.exec(field)?.[1]
    if (field === 'title') result.title = message
    else if (field === 'priceHp') result.price = message
    else if (lessonIndex !== undefined && lessons[Number(lessonIndex)])
      result.lessons[lessons[Number(lessonIndex)].key] = message
    else rest.push(message)
  }
  if (error.errors.length === 0) result.form = error.message
  else if (rest.length > 0) result.form = rest.join(' ')
  return result
}
