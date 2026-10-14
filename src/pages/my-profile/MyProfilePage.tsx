import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { memberProfileQuery } from '@/entities/member/api'
import { MemberProfileView } from '@/entities/member/ui/MemberProfileView'
import { meQuery } from '@/shared/auth/me'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'

/**
 * 내 공개 프로필 미리보기. 다른 회원이 인플루언서 목록에서 보는 모습 그대로다.
 * TODO: 소개·희망 출연료·카테고리는 BE 필드가 생기면 편집할 수 있게 한다(목업 I-프로필 편집).
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
        lede="다른 회원에게 보이는 프로필이에요. 닉네임과 사진은 계정 설정에서 바꿔요."
        actions={
          <Link className="btn" to="/settings">
            닉네임·사진 바꾸기
          </Link>
        }
      />
      {!me || profile.isPending ? (
        <Loading />
      ) : profile.error ? (
        <LoadError error={profile.error} retry={profile.refetch} />
      ) : (
        <MemberProfileView profile={profile.data} />
      )}
    </div>
  )
}
