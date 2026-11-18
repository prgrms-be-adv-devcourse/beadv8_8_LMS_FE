import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { memberProfileQuery } from '@/entities/member/api'
import { MemberProfileView } from '@/entities/member/ui/MemberProfileView'
import { InfluencerProfileForm } from '@/features/account/InfluencerProfileForm'
import { meQuery } from '@/shared/auth/me'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './MyProfilePage.module.css'

/**
 * 내 프로필: 콘텐츠 분야·자기소개 편집과 공개 프로필 미리보기(다른 회원이 인플루언서 목록에서 보는 모습 그대로).
 * 닉네임·사진은 계정 설정에서 바꾼다.
 * TODO: 희망 출연료는 BE 필드가 생기면 편집할 수 있게 한다(목업 I-프로필 편집).
 */
export function MyProfilePage() {
  const { data: me } = useQuery(meQuery)
  const profile = useQuery({
    ...memberProfileQuery(me?.id ?? 0),
    enabled: me != null,
  })

  return (
    <div className="page">
      <PageHead
        title="내 프로필"
        lede="다른 회원에게 보이는 프로필이에요. 콘텐츠 분야와 자기소개는 여기서, 닉네임과 사진은 계정 설정에서 바꿔요."
        actions={
          <Link className="btn" to="/settings">
            닉네임·사진 바꾸기
          </Link>
        }
      />
      {me && (
        // 저장하면 새 값으로 다시 시작한다.
        <InfluencerProfileForm
          key={`${me.contentCategories.map((c) => c.code).join(',')}|${me.bio ?? ''}`}
          me={me}
        />
      )}
      {!me || profile.isPending ? (
        <Loading />
      ) : profile.error ? (
        <LoadError error={profile.error} retry={profile.refetch} />
      ) : (
        // 모니터 화면처럼 테두리를 둘러 편집 폼과 구분한다
        <section className={styles.preview} aria-label="미리보기">
          <div className={styles.monitorHead}>
            <span className={styles.lamp} aria-hidden="true" />
            <span className={styles.eyebrow} aria-hidden="true">
              PREVIEW
            </span>
            <span className="fine">다른 회원에게 이렇게 보여요</span>
          </div>
          <MemberProfileView profile={profile.data} />
        </section>
      )}
    </div>
  )
}
