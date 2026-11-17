import { choose, type MenuOption } from './conversation'
import { newItemId, updateItems } from './store'

/** 버튼마다 고른 뒤 챗봇이 붙이는 안내. 추천 버튼은 4단위에서 요청을 보낸다 */
const GUIDE: Partial<Record<MenuOption, string>> = {
  FAQ_QUESTION:
    '자주 묻는 질문에서 찾아 답해 드릴게요. 궁금한 것을 아래에 적어 주세요.',
  FREE: '강의·인플루언서 추천을 포함해 무엇이든 물어보세요. 아래에 적어 주세요.',
}

/** 말풍선 안 버튼을 눌렀을 때 할 일 */
export function useMenu() {
  return (option: MenuOption) => {
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
