import { useMutation } from '@tanstack/react-query'
import { useRef } from 'react'
import {
  deleteProfileImage,
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_TYPES,
  uploadProfileImage,
} from '@/entities/member/api'
import type { Me } from '@/shared/auth/me'
import { Avatar } from '@/shared/ui/Avatar'
import { toast } from '@/shared/ui/toastStore'
import { useApplyMe } from './useUpdateMe'

/** 프로필 사진 바꾸기·지우기 (jpeg·png·webp, 5MB 이하) */
export function ProfileImageEditor({ me }: { me: Me }) {
  const input = useRef<HTMLInputElement>(null)
  const applyMe = useApplyMe()

  const upload = useMutation({
    mutationFn: (file: File) => uploadProfileImage(me.id, file),
    onSuccess: async (next) => {
      await applyMe(next)
      toast('프로필 사진을 바꿨어요.')
    },
    onError: (error) => toast(error.message),
  })
  const remove = useMutation({
    mutationFn: deleteProfileImage,
    onSuccess: async (next) => {
      await applyMe(next)
      toast('프로필 사진을 지웠어요.')
    },
    onError: (error) => toast(error.message),
  })

  const pick = (file: File | undefined) => {
    if (input.current) input.current.value = ''
    if (!file) return
    if (!PROFILE_IMAGE_TYPES.includes(file.type))
      return toast('프로필 사진은 jpeg·png·webp만 올릴 수 있어요.')
    if (file.size > PROFILE_IMAGE_MAX_BYTES)
      return toast('프로필 사진은 5MB 이하로 올려 주세요.')
    upload.mutate(file)
  }

  const busy = upload.isPending || remove.isPending
  return (
    <div className="field">
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
        프로필 사진
      </span>
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Avatar name={me.nickname} imageUrl={me.profileImageUrl} size={64} />
        <input
          ref={input}
          type="file"
          accept={PROFILE_IMAGE_TYPES.join(',')}
          hidden
          aria-label="프로필 사진 파일"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {upload.isPending ? '올리는 중…' : '사진 바꾸기'}
        </button>
        {me.profileImageUrl && (
          <button
            type="button"
            className="btn ghost sm"
            disabled={busy}
            onClick={() => remove.mutate()}
          >
            지우기
          </button>
        )}
      </div>
      <span className="fine">jpeg·png·webp, 5MB 이하</span>
    </div>
  )
}
