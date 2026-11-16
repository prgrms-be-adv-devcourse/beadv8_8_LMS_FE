import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  SEARCH_CATEGORY_MAX,
  SEARCH_KEYWORD_MAX,
  type InfluencerSearchConditions,
} from '@/entities/member/search'
import { ContentCategoryPicker } from '@/entities/member/ui/ContentCategoryPicker'
import {
  MIN_FOLLOWER_OPTIONS,
  MIN_RATING_OPTIONS,
  SORT_OPTIONS,
  VERIFIED_OPTIONS,
} from './searchConditions'
import styles from './InfluencerSearchBar.module.css'

/** 검색어를 멈춘 뒤 이만큼 지나면 찾는다(글자마다 부르지 않는다) */
export const KEYWORD_DEBOUNCE_MS = 300

type InfluencerSearchBarProps = {
  conditions: InfluencerSearchConditions
  update: (
    next: Partial<InfluencerSearchConditions>,
    options?: { replace?: boolean },
  ) => void
}

/**
 * 검색어·콘텐츠 분야·인증 여부·최소 팔로워·최소 출연 평점·정렬.
 * 검색어는 입력을 멈추고 잠시 뒤 찾고, Enter는 바로 찾는다
 */
export function InfluencerSearchBar({
  conditions,
  update,
}: InfluencerSearchBarProps) {
  const [draft, setDraft] = useKeywordDraft(conditions.keyword)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const typeKeyword = (value: string) => {
    setDraft(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // 조건이 실제로 바뀔 때만 URL을 바꾼다(앞뒤 공백만 바뀌면 그대로). 이어서 고치는 검색어는 방문 기록을 덮어써
      // 뒤로 가기가 입력 전 화면으로 돌아가게 한다.
      if (value.trim() !== conditions.keyword)
        update(
          { keyword: value.trim() },
          { replace: conditions.keyword !== '' },
        )
    }, KEYWORD_DEBOUNCE_MS)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    clearTimeout(timer.current)
    if (draft.trim() !== conditions.keyword) update({ keyword: draft.trim() })
  }

  return (
    <section className={styles.bar} aria-label="인플루언서 찾기">
      <form className={styles.search} role="search" onSubmit={submit}>
        <input
          className="input"
          type="search"
          value={draft}
          maxLength={SEARCH_KEYWORD_MAX}
          onChange={(e) => typeKeyword(e.target.value)}
          placeholder="닉네임·채널·콘텐츠 분야·자기소개로 찾기"
          aria-label="인플루언서 검색"
        />
        <button type="submit" className="btn">
          검색
        </button>
      </form>
      <div className={styles.filters}>
        <OptionSelect
          label="인증 여부"
          options={VERIFIED_OPTIONS}
          value={conditions.verified}
          onChange={(verified) => update({ verified })}
        />
        <OptionSelect
          label="최소 팔로워"
          options={MIN_FOLLOWER_OPTIONS}
          value={conditions.minFollowers}
          onChange={(minFollowers) => update({ minFollowers })}
        />
        <OptionSelect
          label="최소 출연 평점"
          options={MIN_RATING_OPTIONS}
          value={conditions.minRating}
          onChange={(minRating) => update({ minRating })}
        />
        <OptionSelect
          label="정렬"
          options={SORT_OPTIONS}
          value={conditions.sort}
          onChange={(sort) => update({ sort })}
        />
      </div>
      <div className={styles.categories}>
        <label className={styles.label} htmlFor="influencer-search-categories">
          콘텐츠 분야
        </label>
        <ContentCategoryPicker
          id="influencer-search-categories"
          value={conditions.contentCategories}
          onChange={(contentCategories) => update({ contentCategories })}
          max={SEARCH_CATEGORY_MAX}
          placeholder="분야를 고르면 하나라도 가진 인플루언서를 찾아요"
        />
      </div>
      {conditions.sort === 'rating' && (
        <p className="fine">
          출연 평점 높은 순은 리뷰 수를 함께 반영한 순서예요. 리뷰가 적으면
          평균이 높아도 아래에 올 수 있어요.
        </p>
      )}
    </section>
  )
}

/**
 * 검색어 입력값. URL의 검색어가 바뀌면(뒤로 가기, 조건 지우기) 그 값으로 맞춘다.
 * 입력을 기다렸다 찾은 검색어는 입력값을 다듬은 값이라, 다듬은 입력값이 같으면 덮어쓰지 않는다
 * (입력 중인 끝 공백을 지우지 않는다). 렌더 중에 이전 검색어와 비교해 맞춘다(useSearchDraft와 같은 방식)
 */
function useKeywordDraft(keyword: string) {
  const [draft, setDraft] = useState(keyword)
  const [synced, setSynced] = useState(keyword)
  if (synced !== keyword) {
    setSynced(keyword)
    if (draft.trim() !== keyword) setDraft(keyword)
  }
  return [draft, setDraft] as const
}

type OptionSelectProps<T> = {
  label: string
  options: readonly [T | undefined, string][]
  value: T | undefined
  onChange: (value: T | undefined) => void
}

/** 첫 선택지(값 없음)는 조건 없음이다 */
function OptionSelect<T>({
  label,
  options,
  value,
  onChange,
}: OptionSelectProps<T>) {
  const key = (v: T | undefined) => (v === undefined ? '' : String(v))
  return (
    <select
      className="select sm"
      aria-label={label}
      value={key(value)}
      onChange={(e) =>
        onChange(options.find(([v]) => key(v) === e.target.value)?.[0])
      }
    >
      {options.map(([v, name]) => (
        <option key={key(v)} value={key(v)}>
          {name}
        </option>
      ))}
    </select>
  )
}
