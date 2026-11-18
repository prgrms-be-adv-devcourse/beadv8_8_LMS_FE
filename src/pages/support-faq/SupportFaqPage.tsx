import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { faqsQuery } from '@/entities/chatbot/api'
import {
  FAQ_CATEGORIES,
  faqCategoryName,
  isFaqCategory,
} from '@/entities/chatbot/labels'
import type { FaqCategory } from '@/entities/chatbot/types'
import { FaqList } from '@/entities/chatbot/ui/FaqList'
import { ChatbotIcon } from '@/features/chatbot/ChatbotIcon'
import { focusComposer, openChatbot } from '@/features/chatbot/store'
import { MEMBER } from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { useMergedSearchParams } from '@/shared/lib/useMergedSearchParams'
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
  const [params, merge] = useMergedSearchParams()
  const raw = params.get('category')
  const category = isFaqCategory(raw) ? raw : null

  const choose = (tab: Tab) =>
    merge((current) => {
      const next = new URLSearchParams(current)
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
      <AskMore />
    </div>
  )
}

/**
 * 목록 아래 다음 길: 챗봇 창을 열어 바로 입력칸으로 보내고, 회원(관리자 제외)에게는 고객센터 문의도 함께 보인다.
 * 이 화면은 로그인 회원만 들어오므로 챗봇은 누구나 쓸 수 있다.
 */
function AskMore() {
  const viewer = useViewer()
  const canInquire = !!viewer && MEMBER.includes(viewer)
  return (
    <section className={styles.askMore} aria-labelledby="faq-ask-more">
      <span className={styles.askMark} aria-hidden="true">
        <ChatbotIcon size={22} />
      </span>
      <div className={styles.askText}>
        <h2 id="faq-ask-more">찾는 답이 없나요?</h2>
        <p>챗봇에게 상황을 적어 물어보면 FAQ를 찾아 답해 드려요.</p>
      </div>
      <div className={styles.askActions}>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            openChatbot()
            focusComposer()
          }}
        >
          챗봇에게 물어보기
        </button>
        {canInquire && (
          <Link to="/support" className="btn ghost">
            고객센터 문의
          </Link>
        )}
      </div>
    </section>
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
