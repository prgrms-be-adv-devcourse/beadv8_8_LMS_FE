import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { MINIMUM_FEE } from '@/entities/appearance/rules'
import { influencersQuery } from '@/entities/member/api'
import { useProfileImages } from '@/entities/member/profileImages'
import {
  hasSearchConditions,
  INFLUENCER_SEARCH_PAGE_SIZE,
  influencerSearchQuery,
  PAGE_TOO_DEEP,
  SEARCH_RESULT_WINDOW,
  SEARCH_UNAVAILABLE,
  type InfluencerSearchItem,
} from '@/entities/member/search'
import type { MemberProfile } from '@/entities/member/types'
import {
  InfluencerCard,
  InfluencerCardSkeleton,
  type InfluencerCardMember,
} from '@/entities/member/ui/InfluencerCard'
import { RequestFormModal } from '@/features/appearance-request/RequestFormModal'
import { useStartChat } from '@/features/chat/useChatActions'
import { InfluencerSearchBar } from '@/features/influencer-search/InfluencerSearchBar'
import { InfluencerRecommendWidget } from '@/features/recommend-widget/InfluencerRecommendWidget'
import { useSearchConditions } from '@/features/influencer-search/searchConditions'
import { isApiError } from '@/shared/api/ApiError'
import type { PagedModel } from '@/shared/api/types'
import { meQuery } from '@/shared/auth/me'
import { INFLUENCER, type Viewer } from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError } from '@/shared/ui/QueryState'
import styles from './InfluencersPage.module.css'

const isInfluencer = (role: string | undefined) =>
  role !== undefined && INFLUENCER.includes(role as Viewer)

/** 검색 결과에서 넘길 수 있는 마지막 페이지 수(앞에서 1,000건까지만 볼 수 있다) */
const SEARCH_MAX_PAGES = SEARCH_RESULT_WINDOW / INFLUENCER_SEARCH_PAGE_SIZE

/**
 * 인플루언서 목록과 검색. 검색어·필터·정렬이 없으면 회원 앱의 목록(최신 가입순)을, 하나라도 있으면 검색 API를 쓴다.
 * 두 순서가 달라 '전체 인플루언서'와 '검색 결과 n명'을 나눠 보인다. 조건을 모두 지우면 기본 목록으로 돌아간다
 */
export function InfluencersPage() {
  const viewer = useViewer()
  const { conditions, update, reset } = useSearchConditions()
  const searching = hasSearchConditions(conditions)
  const [page, setPage] = usePageParam('page')
  const list = useQuery({ ...influencersQuery(page), enabled: !searching })
  const search = useQuery({
    ...influencerSearchQuery(conditions, page),
    enabled: searching,
  })
  const moving = useClampPage(page, searching ? search : list, setPage)
  const startChat = useStartChat()
  const [requestTo, setRequestTo] = useState<InfluencerCardMember | null>(null)

  // 프로필 화면과 같은 규칙: 인플루언서끼리는 채팅·출연 요청, 관리자는 채팅만, 유저·비회원은 프로필만
  const actionsFor = (member: InfluencerCardMember) =>
    (isInfluencer(viewer) || viewer === 'ADMIN') &&
    isInfluencer(member.role) && (
      <CardActions
        member={member}
        chatting={startChat.isPending}
        onChat={() => startChat.mutate(member.id)}
        onRequest={() => setRequestTo(member)}
      />
    )

  return (
    <div className="page">
      <PageHead
        title="인플루언서"
        lede={`채널 인증을 마친 인플루언서예요. 채팅으로 일정을 맞춘 뒤 출연 요청을 보내세요. 최저 출연료는 1인당 ${MINIMUM_FEE.toLocaleString()} HP예요.`}
      />
      {viewer === 'USER' && (
        <div className="notice">
          출연 요청과 채팅은 채널 인증을 마친 인플루언서부터 쓸 수 있어요.
          <Link className="link" to="/verify">
            채널 인증하기
          </Link>
        </div>
      )}
      {/* 둘러볼 때만 추천 인플루언서 띠를 둔다(검색 중에는 숨긴다) */}
      {!searching && (
        <InfluencerRecommendWidget
          signedIn={viewer !== undefined && viewer !== 'GUEST'}
        />
      )}
      <InfluencerSearchBar conditions={conditions} update={update} />
      {searching ? (
        <SearchResults
          query={search}
          moving={moving}
          actionsFor={actionsFor}
          onPage={setPage}
          onReset={reset}
        />
      ) : (
        <AllInfluencers
          query={list}
          moving={moving}
          actionsFor={actionsFor}
          onPage={setPage}
        />
      )}
      {requestTo && (
        <RequestFormModal
          guest={requestTo}
          onClose={() => setRequestTo(null)}
        />
      )}
    </div>
  )
}

type ResultsProps<T> = {
  query: UseQueryResult<PagedModel<T>>
  /** URL의 페이지가 범위를 넘어 옮기는 중 */
  moving: boolean
  actionsFor: (member: InfluencerCardMember) => ReactNode
  onPage: (page: number) => void
}

/** 검색 조건이 없을 때: 회원 앱의 인플루언서 목록(최신 가입순, 필터·정렬 없음) */
function AllInfluencers({
  query: { data, error, isPending, refetch },
  moving,
  actionsFor,
  onPage,
}: ResultsProps<MemberProfile>) {
  return (
    <section className={styles.results} aria-labelledby="influencers-heading">
      <div className={styles.resultsHead}>
        <h2 id="influencers-heading">전체 인플루언서</h2>
        <span className={styles.order}>최신 가입순</span>
      </div>
      {isPending || moving ? (
        <CardsLoading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState title="아직 인증된 인플루언서가 없어요" />
      ) : (
        <>
          <div className={styles.grid}>
            {data.content.map((member) => (
              <InfluencerCard
                key={member.id}
                member={member}
                actions={actionsFor(member)}
              />
            ))}
          </div>
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={onPage}
          />
        </>
      )}
    </section>
  )
}

/**
 * 검색 결과. 조건을 바꾸는 동안 이전 결과를 흐리게 두고 새 결과로 바꾼다.
 * 사진은 페이지마다 회원 ID로 한 번에 받는다
 */
function SearchResults({
  query: { data, error, isPending, isPlaceholderData, refetch },
  moving,
  actionsFor,
  onPage,
  onReset,
}: ResultsProps<InfluencerSearchItem> & { onReset: () => void }) {
  const images = useProfileImages(data?.content.map((m) => m.id) ?? [])
  const total = data?.page.totalElements ?? 0

  return (
    <section className={styles.results} aria-labelledby="influencers-heading">
      <div className={styles.resultsHead}>
        <h2 id="influencers-heading">
          검색 결과{' '}
          {data && (
            <span className={styles.count}>
              {total >= SEARCH_RESULT_WINDOW
                ? `${formatNumber(SEARCH_RESULT_WINDOW)}명 이상`
                : `${formatNumber(total)}명`}
            </span>
          )}
        </h2>
        <button type="button" className="btn sm ghost" onClick={onReset}>
          조건 모두 지우기
        </button>
      </div>
      {error ? (
        <SearchError
          error={error}
          retry={refetch}
          onReset={onReset}
          onFirstPage={() => onPage(0)}
        />
      ) : isPending || moving ? (
        <CardsLoading />
      ) : data.content.length === 0 ? (
        <EmptyState
          title="조건에 맞는 인플루언서가 없어요."
          action={
            <button type="button" className="btn" onClick={onReset}>
              필터 초기화
            </button>
          }
        >
          검색어나 필터를 바꿔 보세요.
        </EmptyState>
      ) : (
        <>
          <div
            className={
              isPlaceholderData ? `${styles.grid} ${styles.stale}` : styles.grid
            }
            aria-busy={isPlaceholderData || undefined}
          >
            {data.content.map((item) => {
              const member = {
                ...item,
                profileImageUrl: images.urlOf(item.id),
              }
              return (
                <InfluencerCard
                  key={item.id}
                  member={member}
                  onImageError={() => images.onImageError(item.id)}
                  actions={actionsFor(member)}
                >
                  <SearchItemDetails item={item} />
                </InfluencerCard>
              )
            })}
          </div>
          <Pager
            page={data.page.number}
            totalPages={Math.min(data.page.totalPages, SEARCH_MAX_PAGES)}
            onChange={onPage}
          />
        </>
      )}
    </section>
  )
}

/** 카드가 올 자리를 뼈대로 채운다. 화면 읽기 프로그램에는 불러오는 중이라고만 알린다 */
function CardsLoading() {
  return (
    <div className={styles.grid} role="status">
      <span className="sr-only">불러오는 중…</span>
      {Array.from({ length: 6 }, (_, i) => (
        <InfluencerCardSkeleton key={i} />
      ))}
    </div>
  )
}

/** 대표 채널 이름·팔로워 수와 자기소개(2줄까지) */
function SearchItemDetails({ item }: { item: InfluencerSearchItem }) {
  const followers = `팔로워 ${formatNumber(item.followerCount)}명`
  return (
    <>
      {(item.channelName || item.followerCount > 0) && (
        <p className={styles.channel}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.channelText}>
            {item.channelName
              ? `${item.channelName} · ${followers}`
              : followers}
          </span>
        </p>
      )}
      {item.bio && <p className={styles.bio}>{item.bio}</p>}
    </>
  )
}

function SearchError({
  error,
  retry,
  onReset,
  onFirstPage,
}: {
  error: Error
  retry: () => void
  onReset: () => void
  onFirstPage: () => void
}) {
  if (isApiError(error, SEARCH_UNAVAILABLE))
    return (
      <EmptyState
        title="지금은 검색할 수 없어요. 잠시 후 다시 시도해 주세요."
        action={
          <div className="row-actions">
            <button type="button" className="btn primary" onClick={onReset}>
              전체 목록 보기
            </button>
            <button type="button" className="btn" onClick={retry}>
              다시 시도
            </button>
          </div>
        }
      >
        검색이 멈춰도 전체 인플루언서 목록은 볼 수 있어요.
      </EmptyState>
    )
  if (isApiError(error, PAGE_TOO_DEEP))
    return (
      <EmptyState
        title="검색 결과는 앞에서 1,000건까지만 볼 수 있어요."
        action={
          <button type="button" className="btn" onClick={onFirstPage}>
            첫 페이지로
          </button>
        }
      >
        검색어나 조건을 좁혀 주세요.
      </EmptyState>
    )
  return <LoadError error={error} retry={retry} />
}

type CardActionsProps = {
  member: InfluencerCardMember
  chatting: boolean
  onChat: () => void
  onRequest: () => void
}

/**
 * 관리자는 출연 거래를 할 수 없어 채팅만 시작한다(BE: 채팅은 인플루언서 이상·관리자).
 * 내 카드에는 출연 요청·채팅 대신 내 프로필 편집으로 가는 링크를 둔다.
 */
function CardActions({
  member,
  chatting,
  onChat,
  onRequest,
}: CardActionsProps) {
  const viewer = useViewer()
  const { data: me } = useQuery(meQuery)

  const chat = (
    <button
      type="button"
      className="btn sm"
      disabled={chatting}
      aria-label={`${member.nickname} 님과 채팅`}
      onClick={onChat}
    >
      채팅
    </button>
  )
  if (viewer === 'ADMIN') return chat
  if (me?.id === member.id)
    return (
      <Link className="btn sm" to="/profile/edit">
        내 프로필
      </Link>
    )
  return (
    <>
      {chat}
      <button
        type="button"
        className="btn primary sm"
        aria-label={`${member.nickname} 님에게 출연 요청`}
        onClick={onRequest}
      >
        출연 요청
      </button>
    </>
  )
}
