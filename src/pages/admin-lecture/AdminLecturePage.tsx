import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { adminLectureQuery } from '@/entities/lecture/api'
import type { LectureDetail } from '@/entities/lecture/types'
import { MyLectureStatusPill } from '@/entities/lecture/ui/MyLectureStatusPill'
import {
  useApproveLecture,
  useRejectLecture,
} from '@/features/lecture-inspection/useInspectionActions'
import { ContentView } from '@/features/lecture-watch/ContentView'
import { formatDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Field } from '@/shared/ui/Field'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AdminLecturePage.module.css'

/** 화면 안내용 검수 기준. 서버로 보내지 않는다. */
const CHECKLIST = [
  '소개와 실제 내용이 일치해요',
  '영상·음량 품질이 기준에 맞아요',
  '저작권 문제가 없어요',
  '개인정보가 노출되지 않아요',
]

const REJECT_TEMPLATES = [
  '영상 음량이 다른 강의보다 크게 낮아요',
  '소개와 실제 내용이 달라요',
  '저작권 확인이 필요한 음원이 있어요',
  '연락처·실명 같은 개인정보가 화면에 보여요',
]

const back = (
  <Link className="back" to="/admin/lectures">
    ← 강의 검수
  </Link>
)

export function AdminLecturePage() {
  const lectureId = Number(useParams().lectureId)
  const { data, error, isPending, refetch } = useQuery(
    adminLectureQuery(lectureId),
  )

  if (isPending)
    return (
      <div className="page">
        {back}
        <Loading />
      </div>
    )
  if (error)
    return (
      <div className="page">
        {back}
        <LoadError error={error} retry={refetch} />
      </div>
    )
  return <Inspection key={lectureId} lecture={data} />
}

function Inspection({ lecture }: { lecture: LectureDetail }) {
  const asideRef = useRef<HTMLElement>(null)
  const contents = [...lecture.contents].sort((a, b) => a.sequence - b.sequence)
  const [index, setIndex] = useState(0)
  const current = contents[index] ?? contents[0]
  const pending = !lecture.deleted && lecture.status === 'PENDING_INSPECTION'

  return (
    <div className="page">
      {back}
      <PageHead
        title={lecture.title}
        lede={lecture.description}
        actions={<MyLectureStatusPill lecture={lecture} />}
      />
      {pending && lecture.rejectionReason && (
        <div className="notice warn">반려 뒤 다시 신청한 강의예요</div>
      )}
      <div className="split">
        <div className="page" style={{ gap: 16 }}>
          {current ? (
            <ContentView lectureId={lecture.lectureId} content={current} />
          ) : (
            <EmptyState title="올라온 콘텐츠가 없어요" />
          )}
          <section className="panel">
            <div className="panel-head">
              <h2 id="curriculum">커리큘럼</h2>
              <span className="fine num">{contents.length}개</span>
            </div>
            <ol className={styles.curr} aria-labelledby="curriculum">
              {contents.map((c, i) => (
                <li key={c.contentId}>
                  <span className={styles.no}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <button
                    type="button"
                    className={styles.lesson}
                    aria-current={i === index ? 'true' : undefined}
                    onClick={() => setIndex(i)}
                  >
                    {c.title}
                  </button>
                  <span className="pill mute">
                    {c.contentType === 'VIDEO' ? '영상' : '자료'}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="panel sticky" ref={asideRef}>
          <h2>검수 체크리스트</h2>
          <dl className="kv">
            <dt>판매자</dt>
            <dd>{lecture.sellerNickname}</dd>
            <dt>가격</dt>
            <dd className="num">
              {formatNumber(lecture.priceHp)} HP{' '}
              <span className="c-earn">· 1,000 단위 확인</span>
            </dd>
            <dt>등록일</dt>
            <dd>{formatDate(lecture.createdAt)}</dd>
          </dl>
          {lecture.rejectionReason && (
            <div className={styles.reason}>
              <span className="fine">이전 반려 사유</span>
              <p>{lecture.rejectionReason}</p>
            </div>
          )}
          {pending ? (
            <Decide lectureId={lecture.lectureId} />
          ) : (
            <div className="notice">{resultNotice(lecture)}</div>
          )}
          <p className="fine">
            검수 기준은 관리자 재량이에요. 반려하면 판매자가 영상·자료를 고쳐서
            다시 신청해요.
          </p>
        </aside>
      </div>
      <div className="m-cta">
        <span>
          <b>{lecture.title}</b>
        </span>
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            asideRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            })
          }
        >
          {pending ? '검수하기' : '결과 보기'}
        </button>
      </div>
    </div>
  )
}

function resultNotice(lecture: LectureDetail) {
  if (lecture.deleted) return '삭제된 강의예요'
  if (lecture.status === 'ON_SALE') return '승인 처리한 강의예요'
  return '반려 처리한 강의예요. 판매자가 고쳐서 다시 신청하면 검수 대기로 돌아와요.'
}

/** 체크리스트를 모두 확인해야 승인할 수 있고, 사유를 적어야 반려할 수 있다. 처리하면 목록으로 간다. */
function Decide({ lectureId }: { lectureId: number }) {
  const navigate = useNavigate()
  const toList = () => navigate('/admin/lectures')
  const approve = useApproveLecture(lectureId, { onDone: toList })
  const reject = useRejectLecture(lectureId, { onDone: toList })
  const [checked, setChecked] = useState<boolean[]>(() =>
    CHECKLIST.map(() => false),
  )
  const [reason, setReason] = useState('')
  const busy = approve.isPending || reject.isPending

  return (
    <>
      {CHECKLIST.map((label, i) => (
        <label key={label} className="chk-row" htmlFor={`lc-${i}`}>
          <input
            id={`lc-${i}`}
            type="checkbox"
            checked={checked[i]}
            onChange={(e) =>
              setChecked((c) =>
                c.map((v, j) => (j === i ? e.target.checked : v)),
              )
            }
          />
          {label}
        </label>
      ))}
      <button
        type="button"
        className="btn primary block"
        disabled={!checked.every(Boolean) || busy}
        onClick={() => approve.mutate()}
      >
        승인하고 공개
      </button>
      <div className="tpl-chips">
        <span className="fine">자주 쓰는 사유</span>
        {REJECT_TEMPLATES.map((t) => (
          <button
            key={t}
            type="button"
            className={reason === t ? 'chip sm on' : 'chip sm'}
            onClick={() => setReason(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <Field id="lc-why" label="반려 사유" hint="판매자에게 그대로 전달돼요.">
        <textarea
          id="lc-why"
          className="textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 3강 음량이 다른 강의보다 크게 낮아요"
        />
      </Field>
      <button
        type="button"
        className="btn danger block"
        disabled={!reason.trim() || busy}
        onClick={() => reject.mutate(reason.trim())}
      >
        반려
      </button>
    </>
  )
}
