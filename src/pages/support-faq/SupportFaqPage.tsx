import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { faqsQuery } from '@/entities/chatbot/api'
import {
  FAQ_CATEGORIES,
  faqCategoryName,
  isFaqCategory,
} from '@/entities/chatbot/labels'
import type { FaqCategory } from '@/entities/chatbot/types'
import { FaqList } from '@/entities/chatbot/ui/FaqList'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import { Tabs } from '@/shared/ui/Tabs'
import styles from './SupportFaqPage.module.css'

type Tab = FaqCategory | 'ALL'

const TAB_ITEMS: { value: Tab; label: string }[] = [
  { value: 'ALL', label: '전체' },
  ...FAQ_CATEGORIES.map((c) => ({ value: c, label: faqCategoryName(c) })),
]

/**
 * 자주 묻는 질문(#246). 분류를 고르고 질문을 누르면 답이 펼쳐진다(GET /chatbot/faqs, 호출 한도 없음).
 * 고른 분류는 URL(?category=)에 두고, 모르는 값이면 전체로 본다. 분류는 너비에 맞춰 여러 줄로 놓는다.
 */
export function SupportFaqPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('category')
  const category = isFaqCategory(raw) ? raw : null

  const choose = (tab: Tab) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (tab === 'ALL') next.delete('category')
      else next.set('category', tab)
      return next
    })

  return (
    <div className="page narrow">
      <PageHead
        title="자주 묻는 질문"
        lede="분류를 고르고 질문을 누르면 답을 볼 수 있어요. 찾는 답이 없으면 챗봇에게 묻거나 고객센터에 문의해 주세요."
      />
      <div className={styles.categories}>
        <Tabs
          label="FAQ 분류"
          items={TAB_ITEMS}
          value={category ?? 'ALL'}
          onChange={choose}
        >
          <Faqs category={category} />
        </Tabs>
      </div>
    </div>
  )
}

function Faqs({ category }: { category: FaqCategory | null }) {
  const { data, error, isPending, refetch } = useQuery(faqsQuery(category))
  if (isPending) return <Loading />
  if (error) return <LoadError error={error} retry={() => void refetch()} />
  if (data.length === 0)
    return <EmptyState title="이 분류에는 아직 질문이 없어요" />
  return <FaqList faqs={data} showCategory={category === null} />
}
