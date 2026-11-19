import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  normalizeRecruitKeyword,
  RECRUIT_FEE_MAX_DIGITS,
  RECRUIT_KEYWORD_MAX,
  RECRUIT_SORTS,
  sameRecruitSearch,
  type RecruitSearch,
  type RecruitSort,
} from '@/entities/appearance/recruitSearch'
import { formatDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import styles from './RecruitSearchBar.module.css'

const IDS = {
  scheduledTo: 'recruit-scheduled-to',
  maxFee: 'recruit-max-fee',
} as const
const ORDER = ['scheduledTo', 'maxFee'] as const
const CONDITIONS_ID = 'recruit-conditions'

type RecruitSearchBarProps = {
  search: RecruitSearch
  update: (next: Partial<RecruitSearch>) => void
  /** 조건 모두 지우기. 부르는 쪽이 이 막대를 새로 그려 입력 중이던 값까지 비운다 */
  onClear: () => void
  /** 처음 그릴 때 검색어 칸으로 포커스를 옮긴다(모두 지우기로 누른 버튼이 사라진 뒤) */
  focusKeyword?: boolean
}

/**
 * 출연 모집 검색: 검색어·방송 날짜·1인 출연료는 입력해 두고 검색(Enter)으로 한꺼번에 반영한다(입력마다 부르지 않는다).
 * 남은 자리·정렬은 고르는 즉시 반영한다. 걸린 조건은 칩으로 보이고 하나씩·모두 지울 수 있다.
 * 좁은 화면에서는 날짜·출연료·남은 자리를 접어 두고 걸린 조건 수를 펼치기 버튼에 보인다
 */
export function RecruitSearchBar({
  search,
  update,
  onClear,
  focusKeyword = false,
}: RecruitSearchBarProps) {
  const [keyword, setKeyword] = useDraft(search.keyword)
  const [from, setFrom] = useDraft(search.scheduledFrom ?? '')
  const [to, setTo] = useDraft(search.scheduledTo ?? '')
  const [minFee, setMinFee] = useDraft(feeText(search.minFee))
  const [maxFee, setMaxFee] = useDraft(feeText(search.maxFee))
  const [open, setOpen] = useState(false)
  const keywordInput = useRef<HTMLInputElement>(null)
  const applied = useRef<HTMLDivElement>(null)
  const fields = useFieldErrors({
    ids: IDS,
    order: ORDER,
    errors: {
      scheduledTo:
        from && to && to < from
          ? '끝 날짜는 시작 날짜와 같거나 뒤여야 해요.'
          : undefined,
      maxFee:
        minFee && maxFee && Number(maxFee) < Number(minFee)
          ? '최대 출연료는 최소 출연료와 같거나 커야 해요.'
          : undefined,
    },
  })

  useEffect(() => {
    if (focusKeyword) keywordInput.current?.focus()
  }, [focusKeyword])

  const chips = conditionChips(search)
  const folded = chips.filter((chip) => chip.key !== 'keyword').length
  // 칩을 지우면 그 자리의 다음 버튼(없으면 검색어 칸)으로 포커스를 옮긴다(누른 버튼이 사라진다)
  const focusAt = useRef<number | null>(null)
  const chipKeys = chips.map((chip) => chip.key).join()
  useEffect(() => {
    const index = focusAt.current
    if (index === null) return
    focusAt.current = null
    const buttons = applied.current?.querySelectorAll('button')
    const next = buttons?.[Math.min(index, buttons.length - 1)]
    ;(next ?? keywordInput.current)?.focus()
  }, [chipKeys])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    // 접힌 칸의 오류도 보이도록 펼친 뒤 첫 오류 칸으로 보낸다
    if (fields.hasErrors) setOpen(true)
    if (fields.blockSubmit()) return
    const next = {
      keyword: normalizeRecruitKeyword(keyword),
      scheduledFrom: from || undefined,
      scheduledTo: to || undefined,
      minFee: minFee === '' ? undefined : Number(minFee),
      maxFee: maxFee === '' ? undefined : Number(maxFee),
    }
    if (!sameRecruitSearch({ ...search, ...next }, search)) update(next)
  }

  return (
    <section className={styles.bar} aria-label="모집글 찾기">
      <form
        className={styles.form}
        role="search"
        noValidate
        onSubmit={submit}
        {...fields.formProps}
      >
        <div className={styles.top}>
          <div className={styles.search}>
            <input
              ref={keywordInput}
              type="search"
              className="input"
              aria-label="검색어"
              placeholder="제목·내용·호스트 닉네임으로 찾기"
              maxLength={RECRUIT_KEYWORD_MAX}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <button
              type="submit"
              className={`btn primary ${styles.submit}`}
              {...fields.submitProps}
            >
              검색
            </button>
          </div>
          <button
            type="button"
            className={`btn ${styles.toggle}`}
            aria-expanded={open}
            aria-controls={CONDITIONS_ID}
            aria-label={folded > 0 ? `조건 ${folded}개 적용됨` : '조건'}
            onClick={() => setOpen((v) => !v)}
          >
            조건
            {folded > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {folded}
              </span>
            )}
          </button>
          <div className={styles.sort}>
            <span className={styles.eyebrow} aria-hidden="true">
              SORT
            </span>
            <select
              className="select sm"
              aria-label="정렬"
              value={search.sort}
              onChange={(e) => update({ sort: e.target.value as RecruitSort })}
            >
              {RECRUIT_SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div
          id={CONDITIONS_ID}
          className={
            open ? `${styles.conditions} ${styles.open}` : styles.conditions
          }
        >
          <RangeGroup
            id="recruit-scheduled"
            label="방송 날짜"
            error={fields.error('scheduledTo')}
            errorId={`${IDS.scheduledTo}-error`}
          >
            <input
              type="date"
              className={`input ${styles.date}`}
              aria-label="방송 날짜 시작"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className={styles.tilde} aria-hidden="true">
              ~
            </span>
            <input
              {...fields.inputProps('scheduledTo')}
              type="date"
              className={`input ${styles.date}`}
              aria-label="방송 날짜 끝"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </RangeGroup>
          <RangeGroup
            id="recruit-fee"
            label="1인 출연료"
            error={fields.error('maxFee')}
            errorId={`${IDS.maxFee}-error`}
          >
            <input
              className={`input num ${styles.fee}`}
              inputMode="numeric"
              aria-label="최소 출연료 (HP)"
              placeholder="최소"
              value={minFee}
              onChange={(e) => setMinFee(digits(e.target.value))}
            />
            <span className={styles.tilde} aria-hidden="true">
              ~
            </span>
            <input
              {...fields.inputProps('maxFee')}
              className={`input num ${styles.fee}`}
              inputMode="numeric"
              aria-label="최대 출연료 (HP)"
              placeholder="최대"
              value={maxFee}
              onChange={(e) => setMaxFee(digits(e.target.value))}
            />
            <span className={styles.unit} aria-hidden="true">
              HP
            </span>
          </RangeGroup>
          <button
            type="submit"
            className={`btn ${styles.apply}`}
            {...fields.submitProps}
          >
            조건 적용
          </button>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={search.hasSeats}
              onChange={(e) => update({ hasSeats: e.target.checked })}
            />
            <span>남은 자리 있는 글만</span>
          </label>
        </div>
      </form>
      {chips.length > 0 && (
        <div ref={applied} className={styles.applied}>
          <ul className={styles.chips} aria-label="적용한 조건">
            {chips.map((chip, index) => (
              <li key={chip.key}>
                <button
                  type="button"
                  className={`chip sm ${styles.chip}`}
                  aria-label={`${chip.text} 조건 지우기`}
                  onClick={() => {
                    focusAt.current = index
                    update(chip.clear)
                  }}
                >
                  {chip.text}
                  <span className={styles.x} aria-hidden="true">
                    ×
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn sm ghost" onClick={onClear}>
            조건 모두 지우기
          </button>
        </div>
      )}
    </section>
  )
}

/** 시작~끝 두 칸을 한 이름으로 묶는다. 범위가 뒤집히면 끝 칸에 오류를 단다(.field.invalid) */
function RangeGroup({
  id,
  label,
  error,
  errorId,
  children,
}: {
  id: string
  label: string
  error?: string
  /** 끝 칸의 aria-describedby가 가리키는 오류 문구 id */
  errorId: string
  children: ReactNode
}) {
  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      className={`field ${error ? 'invalid' : ''} ${styles.range}`}
    >
      <span id={`${id}-label`} className={styles.rangeLabel}>
        {label}
      </span>
      <div className={styles.rangeInputs}>{children}</div>
      {error && (
        <span id={errorId} className="fine c-bad" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

/**
 * 입력 중인 값. 주소의 값이 바뀌면(검색, 칩 지우기, 뒤로 가기) 그 값으로 맞춘다.
 * 다른 조건(정렬 등)만 바뀌면 입력 중인 값을 그대로 둔다. 렌더 중에 이전 값과 비교해 맞춘다
 */
function useDraft(value: string) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  if (synced !== value) {
    setSynced(value)
    setDraft(value)
  }
  return [draft, setDraft] as const
}

const feeText = (fee: number | undefined) =>
  fee === undefined ? '' : String(fee)

/** 숫자만 남기고 앞의 0을 지운다(출연료 칸) */
const digits = (value: string) =>
  value
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, RECRUIT_FEE_MAX_DIGITS)

type Chip = {
  key: 'keyword' | 'scheduled' | 'fee' | 'hasSeats'
  text: string
  clear: Partial<RecruitSearch>
}

/** 걸린 조건(정렬 제외)을 칩 문구로. 범위는 한 칩으로 보이고 함께 지운다 */
function conditionChips(search: RecruitSearch): Chip[] {
  const chips: Chip[] = []
  if (search.keyword)
    chips.push({
      key: 'keyword',
      text: `검색어 ${search.keyword}`,
      clear: { keyword: '' },
    })
  const { scheduledFrom: from, scheduledTo: to } = search
  if (from || to)
    chips.push({
      key: 'scheduled',
      text: `방송 ${rangeText(from && dayText(from), to && dayText(to), ['부터', '까지'])}`,
      clear: { scheduledFrom: undefined, scheduledTo: undefined },
    })
  const { minFee, maxFee } = search
  if (minFee !== undefined || maxFee !== undefined)
    chips.push({
      key: 'fee',
      text: `출연료 ${rangeText(
        minFee === undefined ? undefined : formatNumber(minFee),
        maxFee === undefined ? undefined : formatNumber(maxFee),
        [' HP 이상', ' HP 이하'],
        ' HP',
      )}`,
      clear: { minFee: undefined, maxFee: undefined },
    })
  if (search.hasSeats)
    chips.push({
      key: 'hasSeats',
      text: '남은 자리 있음',
      clear: { hasSeats: false },
    })
  return chips
}

function rangeText(
  from: string | undefined,
  to: string | undefined,
  [after, before]: [string, string],
  unit = '',
) {
  if (from && to)
    return from === to ? `${from}${unit}` : `${from} ~ ${to}${unit}`
  return from ? `${from}${after}` : `${to}${before}`
}

/** 11/20(금). 올해가 아니면 formatDate가 연도를 붙인다(2027/1/5(화)) */
function dayText(date: string) {
  return formatDate(`${date}T00:00:00`)
}
