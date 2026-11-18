import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { lecturesQuery } from '@/entities/lecture/api'
import { LectureCard } from '@/entities/lecture/ui/LectureCard'
import type { Viewer } from '@/shared/auth/role'
import { startGoogleLogin, useViewer } from '@/shared/auth/session'
import { Avatar } from '@/shared/ui/Avatar'
import { LoadError } from '@/shared/ui/QueryState'
import styles from './HomePage.module.css'
import { useReveal } from './useReveal'

/** 히어로 아래 한 줄 안내 */
const HERO_FINE: Record<Viewer, string> = {
  GUEST:
    '가입하면 유저로 시작해요. 방송 채널을 인증하면 합방을 섭외하고 출연할 수 있어요.',
  USER: '팔로워 10명 이상이거나 한 달에 10시간 넘게 방송했다면 채널을 인증할 수 있어요.',
  INFLUENCER:
    '출연 요청은 게스트가 수락하면 성립하고, 모집 글은 내가 게스트를 선정하면 성립해요.',
  VERIFIED_INFLUENCER:
    '출연 요청은 게스트가 수락하면 성립하고, 모집 글은 내가 게스트를 선정하면 성립해요.',
  ADMIN: '관리자 계정은 출연 거래나 강의 구매를 할 수 없어요.',
}

/** 회원 등급 3단계. 지금 내 등급을 표시한다 */
const STEPS: { role: Viewer; no: string; name: string; can: string }[] = [
  {
    role: 'USER',
    no: '01 · 가입하면',
    name: '유저',
    can: '강의를 사고 볼 수 있어요',
  },
  {
    role: 'INFLUENCER',
    no: '02 · 채널을 인증하면',
    name: '인플루언서',
    can: '합방을 섭외하고, 출연하고 출연료를 받아요',
  },
  {
    role: 'VERIFIED_INFLUENCER',
    no: '03 · 승급 심사를 통과하면',
    name: '인증된 인플루언서',
    can: '내 노하우를 강의로 팔아요',
  },
]

/** 출연료가 움직이는 4단계. rail은 그 단계에서 HP가 어떤 상태인지(색) */
const FLOW = [
  {
    title: '출연 요청 · 모집',
    desc: '게스트 한 명에게 요청하거나, 모집 글로 여러 명을 모아요.',
    tone: 'sunken',
    rail: null,
  },
  {
    title: '출연 성립 · HP 보류',
    desc: '게스트가 수락하거나 호스트가 선정하면 출연료가 보류돼요.',
    tone: 'hold',
    rail: 'HOLD',
  },
  {
    title: '같이 방송',
    desc: '방송 전에 취소되면 정책에 따라 HP를 돌려받아요.',
    tone: 'signal',
    rail: 'LIVE',
  },
  {
    title: '출연 확인 · 지급',
    desc: '호스트가 확인하거나 방송 7일 뒤 자동 확인되면 게스트에게 지급돼요.',
    tone: 'earn',
    rail: 'PAID',
  },
] as const

const CHAPTERS = [
  '채널 인증하고 프로필 꾸미기',
  '출연 요청 보내기, 모집 글 올리기',
  '방송하고 출연료 받기',
]

/** 홈: 모든 역할 공통 첫 화면. 서비스 소개와 역할별 다음 행동, 최근 강의를 보여 준다. */
export function HomePage() {
  const viewer = useViewer() ?? 'GUEST'
  const videoRef = useReveal<HTMLElement>()
  const flowRef = useReveal<HTMLElement>()
  const bandRef = useReveal<HTMLElement>()
  const scrollToVideo = () =>
    videoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className={styles.home}>
      <Hero viewer={viewer} onVideo={scrollToVideo} />
      <section
        ref={videoRef}
        id="video"
        className={`${styles.wrap} ${styles.video} ${styles.reveal}`}
      >
        <div className={styles.monitor}>
          <div
            className={styles.player}
            role="img"
            aria-label="합방 소개 영상 자리"
          >
            <span className={styles.ticks} aria-hidden="true" />
            <span className={styles.playerTop}>
              <span className="onair">합방 소개</span>
              <span className={styles.rec}>
                <span className={styles.recDot} aria-hidden="true" />
                REC
              </span>
            </span>
            <span className={styles.play} aria-hidden="true">
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className={styles.playerBottom}>
              <span className={styles.playerTitle}>
                처음 합방하는 날까지,
                <br />
                3단계면 돼요
              </span>
              <span className={`num ${styles.timecode}`}>영상 준비 중</span>
            </span>
          </div>
        </div>
        <div className={styles.videoText}>
          <span className={styles.eyebrow}>VIDEO</span>
          <h2 className={styles.h2}>영상으로 먼저 보세요</h2>
          <p className={styles.lede}>
            섭외 메시지 보내기부터 출연료를 받기까지, 합방이 어떻게 진행되는지
            짧게 보여 드려요.
          </p>
          <ol className={styles.chapters}>
            {CHAPTERS.map((c, i) => (
              <li key={c}>
                <span className={styles.no}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{c}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <Camp viewer={viewer} />
      <section
        ref={flowRef}
        className={`${styles.wrap} ${styles.section} ${styles.reveal}`}
      >
        <div className={styles.secText}>
          <span className={styles.eyebrow}>HOW IT WORKS</span>
          <h2 className={styles.h2}>출연료는 방송이 끝나야 움직여요</h2>
          <p className={styles.lede}>
            거래가 성립하면 출연료를 HP로 묶어 두고, 출연이 확인된 뒤에
            게스트에게 지급해요.
          </p>
        </div>
        <ol className={styles.flow}>
          {FLOW.map((f, i) => (
            <li key={f.title} className={styles[`flow_${f.tone}`]}>
              <span className={styles.rail} aria-hidden="true">
                <span className={`${styles.k} ${styles[f.tone]}`}>{i + 1}</span>
                {f.rail && <span className={styles.railTag}>{f.rail}</span>}
              </span>
              <span className={styles.flowBody}>
                <b className={styles.flowTitle}>{f.title}</b>
                <span className="fine">{f.desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <LatestLectures guest={viewer === 'GUEST'} />
      {viewer === 'GUEST' && (
        <section
          ref={bandRef}
          className={`${styles.wrap} ${styles.bandWrap} ${styles.reveal}`}
        >
          <div className={styles.band}>
            <span className={styles.bandGlow} aria-hidden="true" />
            <div className={styles.bandText}>
              <span className={styles.bandCue} aria-hidden="true">
                <span className={styles.recDot} />
                STAND BY
              </span>
              <b className={styles.bandTitle}>구글 계정으로 바로 시작해요</b>
              <span className={styles.bandSub}>
                가입 후 언제든 채널을 인증할 수 있어요.
              </span>
            </div>
            <button
              type="button"
              className={`btn signal ${styles.bandBtn}`}
              onClick={() => startGoogleLogin('/')}
            >
              Google로 시작하기
            </button>
          </div>
        </section>
      )}
      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <span className={styles.footerLogo}>합방</span>
          <SupportLink viewer={viewer} />
          <span>이용약관</span>
          <span>개인정보 처리방침</span>
        </div>
      </footer>
    </div>
  )
}

/** 고객센터: 회원은 고객센터, 관리자는 문의 답변, 비회원은 글자만(고객센터는 회원 전용) */
function SupportLink({ viewer }: { viewer: Viewer }) {
  if (viewer === 'ADMIN') return <Link to="/admin/inquiries">문의 답변</Link>
  if (viewer === 'GUEST') return <span>고객센터</span>
  return <Link to="/support">고객센터</Link>
}

function Hero({ viewer, onVideo }: { viewer: Viewer; onVideo: () => void }) {
  return (
    <section className={styles.heroBand}>
      <span className={styles.heroGrid} aria-hidden="true" />
      <div className={`${styles.wrap} ${styles.hero}`}>
        <div className={styles.heroText}>
          <span className={`onair ${styles.heroCue}`}>
            방송하는 사람들의 거래소
          </span>
          <h1 className={styles.h1}>
            합방 상대를 찾고,
            <br />
            <span className={styles.h1Accent}>같이 방송해요</span>
          </h1>
          <p className={styles.heroLede}>
            채널을 인증한 인플루언서에게 출연을 요청하거나, 모집 글을 올려
            게스트를 모아요. 출연료는 HP로 보류됐다가 출연이 확인되면 지급돼요.
          </p>
          <div className={styles.actions}>
            {viewer === 'GUEST' && (
              <>
                <button
                  type="button"
                  className="btn signal"
                  onClick={() => startGoogleLogin('/')}
                >
                  <span className={styles.gBadge}>
                    <GoogleIcon />
                  </span>
                  Google로 시작하기
                </button>
                <button type="button" className="btn" onClick={onVideo}>
                  소개 영상 보기
                </button>
              </>
            )}
            {viewer === 'USER' && (
              <>
                <Link className="btn signal" to="/verify">
                  채널 인증하기
                </Link>
                <button type="button" className="btn" onClick={onVideo}>
                  소개 영상 보기
                </button>
              </>
            )}
            {(viewer === 'INFLUENCER' || viewer === 'VERIFIED_INFLUENCER') && (
              <>
                <Link className="btn signal" to="/influencers">
                  게스트 찾기
                </Link>
                <Link className="btn" to="/recruits">
                  모집 글 올리기
                </Link>
              </>
            )}
            {viewer === 'ADMIN' && (
              <Link className="btn signal" to="/admin">
                운영 화면으로
              </Link>
            )}
          </div>
          <p className={`fine ${styles.heroFine}`}>{HERO_FINE[viewer]}</p>
        </div>
        <HeroStage />
      </div>
    </section>
  )
}

/**
 * 히어로 오른쪽 그림(장식): 호스트와 게스트 두 방송 화면이 한 화면으로 합쳐지고 ON AIR가 켜진다.
 * 실제 회원·거래가 아니어서 화면 낭독기에는 숨기고, 지어낸 통계(팔로워 수 등)는 넣지 않는다.
 */
function HeroStage() {
  return (
    <div className={styles.stage} aria-hidden="true">
      <div className={styles.screen}>
        <span className={styles.screenBar}>
          <span className={styles.tally}>
            <span className={styles.lamp} />
            ON AIR
          </span>
          <span className={styles.screenMeta}>화면 예시</span>
        </span>
        <span className={styles.split}>
          <span className={`${styles.cam} ${styles.camA}`}>
            <span className={styles.camTag}>HOST</span>
            <Avatar name="윤" size={52} />
            <b className={styles.camName}>새벽라디오 윤</b>
          </span>
          <span className={styles.seam}>
            <span className={styles.seamMark}>합</span>
          </span>
          <span className={`${styles.cam} ${styles.camB}`}>
            <span className={styles.camTag}>GUEST</span>
            <Avatar name="곰" size={52} />
            <b className={styles.camName}>밤새는곰</b>
          </span>
        </span>
      </div>
      <div className={styles.deal}>
        <span className={styles.dealRow}>
          <span className={styles.dealEyebrow}>출연 요청</span>
          <span className="pill warn">수락 대기</span>
        </span>
        <b className={styles.dealTitle}>10월 24일(토) 22:00 · 공포게임 합방</b>
        <span className={styles.dealRow}>
          <span className="fine">출연료 보류</span>
          <b className={`num ${styles.dealHp}`}>50,000 HP</b>
        </span>
      </div>
    </div>
  )
}

function Camp({ viewer }: { viewer: Viewer }) {
  const ref = useReveal<HTMLElement>()
  // 지금 등급의 위치. 비회원·관리자는 길 위에 없다(-1)
  const at = STEPS.findIndex((s) => s.role === viewer)
  return (
    <section ref={ref} className={`${styles.camp} ${styles.reveal}`}>
      <div className={`${styles.wrap} ${styles.campInner}`}>
        <div className={styles.campHead}>
          <div className={styles.campText}>
            <span className={styles.campEyebrow}>BE AN INFLUENCER</span>
            <h2 className={styles.campTitle}>
              너도 인플루언서가
              <br />될 수 있어
            </h2>
            <p>
              팔로워 10명이거나, 한 달에 10시간 방송했다면 충분해요. 채널을
              인증하면 바로 합방을 섭외하고 출연료를 받을 수 있어요.
            </p>
          </div>
          <CampAction viewer={viewer} />
        </div>
        <ol className={styles.steps}>
          {STEPS.map((s, i) => {
            const here = i === at
            const state = here ? styles.here : i < at ? styles.done : ''
            return (
              <li
                key={s.role}
                className={`${styles.step} ${state}`}
                aria-current={here ? 'step' : undefined}
              >
                <span className={styles.node} aria-hidden="true">
                  {i < at && <CheckIcon />}
                </span>
                <span className={styles.stepCard}>
                  <span className={styles.stepNo}>
                    <span>{s.no}</span>
                    {here && <span className={styles.hereTag}>지금 여기</span>}
                  </span>
                  <b className={styles.stepName}>{s.name}</b>
                  <span className={styles.stepCan}>{s.can}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

/** 다음 등급으로 가는 버튼. 인증된 인플루언서·관리자는 없다 */
function CampAction({ viewer }: { viewer: Viewer }) {
  if (viewer === 'GUEST')
    return (
      <button
        type="button"
        className={`btn primary ${styles.campBtn}`}
        onClick={() => startGoogleLogin('/')}
      >
        Google로 시작하기
      </button>
    )
  if (viewer === 'USER')
    return (
      <Link className={`btn primary ${styles.campBtn}`} to="/verify">
        채널 인증하기
      </Link>
    )
  if (viewer === 'INFLUENCER')
    return (
      <Link className={`btn primary ${styles.campBtn}`} to="/promote">
        승급 신청하기
      </Link>
    )
  return null
}

/** 최근 판매 중인 강의 4개 (비회원도 볼 수 있는 강의 목록 API) */
function LatestLectures({ guest }: { guest: boolean }) {
  const ref = useReveal<HTMLElement>()
  // 강의 목록 첫 화면과 같은 쿼리(같은 캐시)를 써서 4개만 보여 준다. 홈에서 강의로 넘어가면 바로 그려진다.
  const { data, error, isPending, refetch } = useQuery(
    lecturesQuery({ sort: 'LATEST', page: 0 }),
  )
  const lectures = data?.content.slice(0, 4) ?? []
  return (
    <section
      ref={ref}
      className={`${styles.wrap} ${styles.section} ${styles.reveal}`}
    >
      <div className={styles.secHead}>
        <div className={styles.secText}>
          <span className={styles.eyebrow}>LECTURES</span>
          <h2 className={styles.h2}>인플루언서가 만든 방송 강의</h2>
        </div>
        <Link className={`btn ghost ${styles.more}`} to="/lectures">
          전체 강의 ›
        </Link>
      </div>
      {isPending ? (
        <LectureSkeleton />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : lectures.length === 0 ? (
        <div className={styles.lecEmpty}>
          <p className="fine">아직 판매 중인 강의가 없어요.</p>
        </div>
      ) : (
        <div className={styles.lectures}>
          {lectures.map((lecture) => (
            <LectureCard
              key={lecture.lectureId}
              lecture={lecture}
              guest={guest}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** 강의 카드 자리 뼈대. 불러오는 중 안내(role=status)는 화면 낭독기에 그대로 알린다 */
function LectureSkeleton() {
  return (
    <div className={styles.lectures} role="status">
      <span className="sr-only">불러오는 중…</span>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={styles.skelCard} aria-hidden="true">
          <span className={styles.skelThumb} />
          <span className={styles.skelLine} />
          <span className={`${styles.skelLine} ${styles.skelShort}`} />
        </span>
      ))}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10z"
      />
      <path
        fill="#EA4335"
        d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"
      />
    </svg>
  )
}
