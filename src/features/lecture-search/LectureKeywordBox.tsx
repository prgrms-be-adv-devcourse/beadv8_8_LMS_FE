import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { lectureSuggestionsQuery } from '@/entities/lecture/api'
import {
  LECTURE_KEYWORD_MAX,
  normalizeKeyword,
} from '@/entities/lecture/search'
import type { LectureSuggestion } from '@/entities/lecture/types'
import { useDebouncedValue } from '@/shared/lib/useDebouncedValue'
import { SearchCombobox } from '@/shared/ui/SearchCombobox'
import { KEYWORD_DEBOUNCE_MS } from './useKeywordInput'

const NONE: readonly LectureSuggestion[] = []

type LectureKeywordBoxProps = {
  value: string
  onChange: (value: string) => void
  /** 비회원은 강의 상세를 열 수 없어 후보를 고르면 제목으로 검색한다 */
  guest: boolean
  onSearchTitle: (title: string) => void
}

/**
 * 강의 검색어 입력칸과 자동완성 후보. 후보에는 판매자 닉네임을 함께 보인다(닉네임으로 걸린 후보도 있다).
 * 회원은 후보를 고르면 강의 상세로 가고, 비회원은 그 제목으로 검색한다.
 */
export function LectureKeywordBox({
  value,
  onChange,
  guest,
  onSearchTitle,
}: LectureKeywordBoxProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const suggestions = useLectureSuggestions(value, open)

  return (
    <SearchCombobox
      value={value}
      onChange={onChange}
      open={open}
      onOpenChange={setOpen}
      options={suggestions}
      optionKey={(s) => s.lectureId}
      renderOption={(s) => (
        <>
          <span>{s.title}</span>
          {s.sellerNickname && <span className="fine">{s.sellerNickname}</span>}
        </>
      )}
      onPick={(s) =>
        guest ? onSearchTitle(s.title) : navigate(`/lectures/${s.lectureId}`)
      }
      label="강의 검색"
      listLabel="강의 검색어 추천"
      placeholder="강의 제목, 강 제목, 판매자로 찾기"
      maxLength={LECTURE_KEYWORD_MAX}
    />
  )
}

/**
 * 입력이 잠깐 멈춘 검색어의 후보. 목록이 열려 있고 검색어가 비지 않았을 때만 부른다(닫은 뒤 화살표로 다시 열면 받아 둔 후보를 쓴다).
 * 멈춘 검색어가 지금 입력값과 다르면(입력 중) 후보를 보이지 않아, 다른 검색어의 후보나 늦게 온 이전 응답이 남지 않는다.
 * 실패하면(429·503 등) 후보만 숨긴다
 */
function useLectureSuggestions(draft: string, open: boolean) {
  const keyword = normalizeKeyword(draft)
  const settled = useDebouncedValue(keyword, KEYWORD_DEBOUNCE_MS)
  const current = keyword !== '' && settled === keyword
  const { data } = useQuery({
    ...lectureSuggestionsQuery(settled),
    enabled: open && current,
  })
  return current && data ? data : NONE
}
