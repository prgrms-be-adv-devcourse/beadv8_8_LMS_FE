import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { updateMe } from '@/entities/member/api'
import {
  BIO_ERROR_CODE,
  BIO_MAX,
  CONTENT_CATEGORY_ERROR_CODES,
  CONTENT_CATEGORY_MAX,
  INFLUENCER_PROFILE_NOT_ALLOWED,
} from '@/entities/member/contentCategory'
import { ContentCategoryPicker } from '@/entities/member/ui/ContentCategoryPicker'
import { isApiError } from '@/shared/api/ApiError'
import { meQuery, type Me } from '@/shared/auth/me'
import { INFLUENCER } from '@/shared/auth/role'
import { Field } from '@/shared/ui/Field'
import { toast } from '@/shared/ui/toastStore'
import { useApplyMe } from './useUpdateMe'

const CATEGORY_ID = 'profile-content-categories'
const BIO_ID = 'profile-bio'
const BIO_TOO_LONG = `자기소개는 ${BIO_MAX}자 이하로 입력해 주세요.`

const sameCodes = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((code, i) => code === b[i])

/**
 * 인플루언서의 콘텐츠 분야(0~5개, 고른 순서가 그대로 보인다)와 자기소개(100자). 인플루언서가 아니면 그리지 않는다
 * (분야·자기소개를 보내면 요청 전체가 403이라 다른 역할의 화면은 두 값을 보내지 않는다).
 * 저장이 분야·자기소개 오류면 그 칸 아래에 서버 문구를 보이고, 값을 고치면 지운다
 */
export function InfluencerProfileForm({ me }: { me: Me }) {
  const initialCodes = me.contentCategories.map((c) => c.code)
  const initialBio = me.bio ?? ''
  const [codes, setCodes] = useState(initialCodes)
  const [bio, setBio] = useState(initialBio)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [bioServerError, setBioServerError] = useState<string | null>(null)
  const [notAllowed, setNotAllowed] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const applyMe = useApplyMe()
  const save = useMutation({
    mutationFn: updateMe,
    onSuccess: async (next) => {
      await applyMe(next)
      toast('프로필을 저장했어요.')
    },
    onError: (error) => {
      if (isApiError(error) && CONTENT_CATEGORY_ERROR_CODES.has(error.code)) {
        setCategoryError(error.message)
        document.getElementById(CATEGORY_ID)?.focus()
      } else if (isApiError(error, BIO_ERROR_CODE)) {
        setBioServerError(error.message)
        document.getElementById(BIO_ID)?.focus()
      } else if (isApiError(error, INFLUENCER_PROFILE_NOT_ALLOWED)) {
        setNotAllowed(error.message)
        // 역할이 바뀌었을 수 있다. 내 정보를 다시 받아 인플루언서가 아니면 이 칸을 숨긴다.
        void queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
      } else toast(error.message)
    },
  })

  if (!INFLUENCER.includes(me.role)) return null

  const trimmedBio = bio.trim()
  const bioError =
    bioServerError ?? (trimmedBio.length > BIO_MAX ? BIO_TOO_LONG : null)
  const changed = !sameCodes(codes, initialCodes) || trimmedBio !== initialBio

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!changed || bioError || save.isPending) return
    setNotAllowed(null)
    save.mutate({ contentCategories: codes, bio: trimmedBio })
  }
  const revert = () => {
    setCodes(initialCodes)
    setBio(initialBio)
    setCategoryError(null)
    setBioServerError(null)
    setNotAllowed(null)
  }

  return (
    <form
      className="panel form"
      aria-labelledby="influencer-profile-title"
      onSubmit={submit}
    >
      <h2 id="influencer-profile-title">콘텐츠 분야·자기소개</h2>
      <Field
        id={CATEGORY_ID}
        label="콘텐츠 분야"
        error={categoryError ?? undefined}
        hint={`첫 번째 분야가 대표로 보여요. 최대 ${CONTENT_CATEGORY_MAX}개 · ${codes.length}/${CONTENT_CATEGORY_MAX}`}
      >
        <ContentCategoryPicker
          id={CATEGORY_ID}
          value={codes}
          onChange={(next) => {
            setCategoryError(null)
            setCodes(next)
          }}
          max={CONTENT_CATEGORY_MAX}
          reorderable
          known={me.contentCategories}
          inputProps={
            categoryError
              ? {
                  'aria-invalid': true,
                  'aria-describedby': `${CATEGORY_ID}-error`,
                }
              : undefined
          }
        />
      </Field>
      <Field
        id={BIO_ID}
        label="자기소개"
        error={bioError ?? undefined}
        hint={`${trimmedBio.length}/${BIO_MAX}자 · 프로필과 검색 결과에 보여요.`}
      >
        <textarea
          id={BIO_ID}
          className="textarea"
          value={bio}
          placeholder="어떤 방송을 하는지 짧게 소개해 주세요."
          aria-invalid={bioError ? true : undefined}
          aria-describedby={bioError ? `${BIO_ID}-error` : undefined}
          onChange={(e) => {
            setBioServerError(null)
            setBio(e.target.value)
          }}
        />
      </Field>
      {bioError && (
        <p className="fine" aria-live="polite">
          {trimmedBio.length}/{BIO_MAX}자
        </p>
      )}
      {notAllowed && (
        <div className="notice bad" role="alert">
          {notAllowed}
        </div>
      )}
      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn ghost"
          disabled={!changed || save.isPending}
          onClick={revert}
        >
          되돌리기
        </button>
        <button
          type="submit"
          className="btn primary"
          disabled={!changed || bioError !== null || save.isPending}
        >
          저장
        </button>
      </div>
    </form>
  )
}
