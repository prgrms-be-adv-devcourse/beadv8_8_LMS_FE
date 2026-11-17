import { choose, MENU_LABEL, type MenuOption } from './conversation'
import { newItemId, updateItems } from './store'
import { useRecommend } from './useRecommend'

/** 고른 뒤 챗봇이 붙이는 안내(입력창으로 이어지는 버튼) */
const GUIDE: Partial<Record<MenuOption, string>> = {
  FAQ_QUESTION:
    '자주 묻는 질문에서 찾아 답해 드릴게요. 궁금한 것을 아래에 적어 주세요.',
  FREE: '강의·인플루언서 추천을 포함해 무엇이든 물어보세요. 아래에 적어 주세요.',
}

/** 말풍선 안 버튼을 눌렀을 때 할 일 */
export function useMenu() {
  const recommend = useRecommend()
  return (option: MenuOption) => {
    if (option === 'LECTURE' || option === 'INFLUENCER') {
      recommend(option, null, MENU_LABEL[option])
      return
    }
    const text = GUIDE[option]
    updateItems((items) =>
      choose(
        items,
        option,
        { choice: newItemId(), guide: newItemId() },
        text ? { text, options: [] } : undefined,
      ),
    )
  }
}
