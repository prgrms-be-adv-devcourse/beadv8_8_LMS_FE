import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { meQuery } from '@/shared/auth/me'
import { INFLUENCER, viewerLabel } from '@/shared/auth/role'
import { NicknameForm } from '@/features/account/NicknameForm'
import { PasswordForm } from '@/features/account/PasswordForm'
import { ProfileImageEditor } from '@/features/account/ProfileImageEditor'
import { PageHead } from '@/shared/ui/PageHead'
import { Loading } from '@/shared/ui/QueryState'
import styles from './SettingsPage.module.css'

// TODO: 알림 설정은 BE API가 생기면 추가한다.
export function SettingsPage() {
  const { data: me } = useQuery(meQuery)

  return (
    <div className="page narrow">
      <PageHead title="계정 설정" />
      {!me ? (
        <Loading />
      ) : (
        <div className={styles.stack}>
          <section
            className={`panel ${styles.card}`}
            aria-labelledby="settings-profile-title"
          >
            <div className={styles.head}>
              <span className={styles.eyebrow} aria-hidden="true">
                PROFILE
              </span>
              <h2 id="settings-profile-title">프로필</h2>
            </div>
            <ProfileImageEditor me={me}>
              <span className={styles.name}>{me.nickname}</span>
              <span className={styles.role}>
                <span className="sr-only">회원 등급 </span>
                <span className="pill">{viewerLabel(me.role)}</span>
              </span>
            </ProfileImageEditor>
            {/* 닉네임이 바뀌면 입력값을 새 값으로 다시 시작한다. */}
            <NicknameForm key={me.nickname} current={me.nickname} />
            {INFLUENCER.includes(me.role) && (
              <p className={`fine ${styles.note}`}>
                콘텐츠 분야와 자기소개는{' '}
                <Link className="link" to="/profile/edit">
                  내 프로필
                </Link>
                에서 바꿔요.
              </p>
            )}
          </section>

          <section
            className={`panel ${styles.card}`}
            aria-labelledby="settings-security-title"
          >
            <div className={styles.head}>
              <span className={styles.eyebrow} aria-hidden="true">
                SIGN-IN
              </span>
              <h2 id="settings-security-title">로그인·보안</h2>
            </div>
            <dl className={styles.rows}>
              {/* 구글·비밀번호 중 어느 방식으로 가입했는지는 BE가 알려 주지 않아 이메일만 보인다. */}
              <div className={styles.row}>
                <dt>이메일</dt>
                <dd className={styles.value}>{me.email}</dd>
              </div>
            </dl>
            <PasswordForm />
          </section>

          {/* 관리자는 탈퇴 화면(/settings/withdraw)에 들어갈 수 없다. */}
          {me.role !== 'ADMIN' && (
            <section
              className={`panel ${styles.card} ${styles.danger}`}
              aria-labelledby="settings-withdraw-title"
            >
              <div className={styles.head}>
                <span
                  className={`${styles.eyebrow} ${styles.dangerEyebrow}`}
                  aria-hidden="true"
                >
                  DANGER ZONE
                </span>
                <h2 id="settings-withdraw-title">회원 탈퇴</h2>
              </div>
              <div className={styles.dangerRow}>
                <p className="fine">
                  탈퇴하면 30일 안에 다시 로그인해 복구할 수 있어요. 30일이
                  지나면 이메일·닉네임 같은 개인정보를 파기하고, 거래 기록은
                  남아요.
                </p>
                <Link className="btn danger" to="/settings/withdraw">
                  탈퇴 절차 보기
                </Link>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
