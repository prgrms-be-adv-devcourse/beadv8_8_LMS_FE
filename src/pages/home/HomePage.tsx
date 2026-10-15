import { useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { Link } from 'react-router'
import { lecturesQuery } from '@/entities/lecture/api'
import { LectureCard } from '@/entities/lecture/ui/LectureCard'
import type { Viewer } from '@/shared/auth/role'
import { startGoogleLogin, useViewer } from '@/shared/auth/session'
import { Avatar } from '@/shared/ui/Avatar'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './HomePage.module.css'

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

const FLOW = [
  {
    title: '출연 요청 · 모집',
    desc: '게스트 한 명에게 요청하거나, 모집 글로 여러 명을 모아요.',
    tone: 'sunken',
  },
  {
    title: '출연 성립 · HP 보류',
    desc: '게스트가 수락하거나 호스트가 선정하면 출연료가 보류돼요.',
    tone: 'hold',
  },
  {
    title: '같이 방송',
    desc: '방송 전에 취소되면 정책에 따라 HP를 돌려받아요.',
    tone: 'signal',
  },
  {
    title: '출연 확인 · 지급',
    desc: '호스트가 확인하거나 방송 7일 뒤 자동 확인되면 게스트에게 지급돼요.',
    tone: 'earn',
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
  const videoRef = useRef<HTMLElement>(null)
  const scrollToVideo = () =>
    videoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className={styles.home}>
      <Hero viewer={viewer} onVideo={scrollToVideo} />
      <section
        ref={videoRef}
        id="video"
        className={`${styles.wrap} ${styles.video}`}
      >
        <div
          className={styles.player}
          role="img"
          aria-label="합방 소개 영상 자리"
        >
          <span className={styles.playerTop}>
            <span className="onair">합방 소개</span>
            <span className="num">영상 준비 중</span>
          </span>
          <span className={styles.play} aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className={styles.playerTitle}>
            처음 합방하는 날까지,
            <br />
            3단계면 돼요
          </span>
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
      <section className={`${styles.wrap} ${styles.section}`}>
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
            <li key={f.title}>
              <span className={`${styles.k} ${styles[f.tone]}`}>{i + 1}</span>
              <b>{f.title}</b>
              <span className="fine">{f.desc}</span>
            </li>
          ))}
        </ol>
      </section>
      <LatestLectures guest={viewer === 'GUEST'} />
      {viewer === 'GUEST' && (
        <section className={`${styles.wrap} ${styles.bandWrap}`}>
          <div className={styles.band}>
            <div>
              <b className={styles.bandTitle}>구글 계정으로 바로 시작해요</b>
              <span className={styles.bandSub}>
                가입 후 언제든 채널을 인증할 수 있어요.
              </span>
            </div>
            <button
              type="button"
              className="btn"
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
          <Link to="/support">고객센터</Link>
          <span>이용약관</span>
          <span>개인정보 처리방침</span>
        </div>
      </footer>
    </div>
  )
}

function Hero({ viewer, onVideo }: { viewer: Viewer; onVideo: () => void }) {
  return (
    <section className={styles.heroBand}>
      <div className={`${styles.wrap} ${styles.hero}`}>
        <div className={styles.heroText}>
          <span className="onair">방송하는 사람들의 거래소</span>
          <h1 className={styles.h1}>
            합방 상대를 찾고,
            <br />
            같이 방송해요
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
                  className="btn primary"
                  onClick={() => startGoogleLogin('/')}
                >
                  <GoogleIcon />
                  Google로 시작하기
                </button>
                <button type="button" className="btn" onClick={onVideo}>
                  소개 영상 보기
                </button>
              </>
            )}
            {viewer === 'USER' && (
              <>
                <Link className="btn primary" to="/verify">
                  채널 인증하기
                </Link>
                <button type="button" className="btn" onClick={onVideo}>
                  소개 영상 보기
                </button>
              </>
            )}
            {(viewer === 'INFLUENCER' || viewer === 'VERIFIED_INFLUENCER') && (
              <>
                <Link className="btn primary" to="/influencers">
                  게스트 찾기
                </Link>
                <Link className="btn" to="/recruits">
                  모집 글 올리기
                </Link>
              </>
            )}
            {viewer === 'ADMIN' && (
              <Link className="btn primary" to="/admin">
                운영 화면으로
              </Link>
            )}
          </div>
          <p className={`fine ${styles.heroFine}`}>{HERO_FINE[viewer]}</p>
        </div>
        {/* 화면 예시(장식). 실제 회원·거래가 아니다. */}
        <div className={styles.example} aria-hidden="true">
          <span className={styles.exampleLabel}>화면 예시</span>
          <div className={`${styles.mini} ${styles.miniA}`}>
            <Avatar name="윤" size={44} />
            <span className={styles.miniText}>
              <b>
                새벽라디오 윤 <span className="pill info">인증</span>
              </b>
              <span className="fine">토크 · 팔로워 28,900 · 합방 31회</span>
            </span>
          </div>
          <div className={`${styles.mini} ${styles.miniB}`}>
            <Avatar name="곰" size={44} />
            <span className={styles.miniText}>
              <b>밤새는곰</b>
              <span className="fine">게임 · 팔로워 12,840 · 합방 14회</span>
            </span>
          </div>
          <div className={`${styles.mini} ${styles.miniC}`}>
            <span className={styles.miniRow}>
              <span className={styles.eyebrow}>출연 요청</span>
              <span className="pill warn">수락 대기</span>
            </span>
            <b>10월 24일(토) 22:00 · 공포게임 합방</b>
            <span className={styles.miniRow}>
              <span className="fine">출연료 보류</span>
              <b className="num">50,000 HP</b>
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

function Camp({ viewer }: { viewer: Viewer }) {
  return (
    <section className={styles.camp}>
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
          {STEPS.map((s) => {
            const here = s.role === viewer
            return (
              <li
                key={s.role}
                className={here ? `${styles.step} ${styles.here}` : styles.step}
                aria-current={here ? 'step' : undefined}
              >
                <span className={styles.stepNo}>
                  <span>{s.no}</span>
                  {here && <span className={styles.hereTag}>지금 여기</span>}
                </span>
                <b className={styles.stepName}>{s.name}</b>
                <span className={styles.stepCan}>{s.can}</span>
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
        className={`btn ${styles.campBtn}`}
        onClick={() => startGoogleLogin('/')}
      >
        Google로 시작하기
      </button>
    )
  if (viewer === 'USER')
    return (
      <Link className={`btn ${styles.campBtn}`} to="/verify">
        채널 인증하기
      </Link>
    )
  if (viewer === 'INFLUENCER')
    return (
      <Link className={`btn ${styles.campBtn}`} to="/promote">
        승급 신청하기
      </Link>
    )
  return null
}

/** 최근 판매 중인 강의 4개 (비회원도 볼 수 있는 강의 목록 API) */
function LatestLectures({ guest }: { guest: boolean }) {
  const { data, error, isPending, refetch } = useQuery(
    lecturesQuery({ sort: 'LATEST', page: 0 }),
  )
  const lectures = data?.content.slice(0, 4) ?? []
  return (
    <section className={`${styles.wrap} ${styles.section}`}>
      <div className={styles.secHead}>
        <div className={styles.secText}>
          <span className={styles.eyebrow}>LECTURES</span>
          <h2 className={styles.h2}>인플루언서가 만든 방송 강의</h2>
        </div>
        <Link className="btn ghost" to="/lectures">
          전체 강의 ›
        </Link>
      </div>
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : lectures.length === 0 ? (
        <p className="fine">아직 판매 중인 강의가 없어요.</p>
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
