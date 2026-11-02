import { describe, expect, it } from 'vitest'
import { createSendGate } from './sendGate'

function setup(limit = 2) {
  const gate = createSendGate(limit)
  const sent: string[] = []
  const submit = (id: string, ok = true) =>
    gate.submit(id, () => {
      sent.push(id)
      return ok
    })
  return { gate, sent, submit }
}

describe('createSendGate', () => {
  it('상한까지만 보내고, 결과가 나오면 맡긴 순서대로 다음 것을 보낸다', () => {
    const { gate, sent, submit } = setup()
    for (const id of ['a', 'b', 'c', 'd']) submit(id)
    expect(sent).toEqual(['a', 'b'])
    expect(gate.isInFlight('c')).toBe(false)

    gate.settle('b')
    expect(sent).toEqual(['a', 'b', 'c'])
    gate.settle('b') // 이미 비운 자리는 다시 비우지 않는다
    expect(sent).toEqual(['a', 'b', 'c'])
    gate.settle('a')
    expect(sent).toEqual(['a', 'b', 'c', 'd'])
  })

  it('보내지 못한 전송(연결 없음)은 자리를 잡지 않는다', () => {
    const { gate, sent, submit } = setup()
    submit('a', false)
    submit('b')
    submit('c')
    expect(sent).toEqual(['a', 'b', 'c'])
    expect(gate.isInFlight('a')).toBe(false)
  })

  it('정리하면 결과가 난 전송의 자리를 비우고, 기다리던 것 가운데 버린 것은 보내지 않는다', () => {
    const { gate, sent, submit } = setup()
    for (const id of ['a', 'b', 'c', 'd']) submit(id)

    // a는 결과가 났고 c는 지웠다.
    gate.retain((id) => id !== 'a' && id !== 'c')
    expect(sent).toEqual(['a', 'b', 'd'])
  })

  it('보내는 동안 다시 불려도(상태 변경 알림이 다른 자리를 비움) 상한을 넘지 않는다', () => {
    const gate = createSendGate(2)
    const sent: string[] = []
    const plain = (id: string) => () => {
      sent.push(id)
      return true
    }
    gate.submit('a', plain('a'))
    gate.submit('b', plain('b'))
    gate.submit('c', () => {
      sent.push('c')
      // c를 보내는 사이 b의 결과가 났다는 알림이 와서 다음 것을 보내려 한다.
      gate.retain((id) => id !== 'b')
      return true
    })
    gate.submit('d', plain('d'))
    gate.submit('e', plain('e'))

    gate.settle('a')
    // c와 d가 자리를 채우고 e는 기다린다.
    expect(sent).toEqual(['a', 'b', 'c', 'd'])
  })

  it('같은 전송을 다시 맡기면 한 번만 기다린다', () => {
    const { gate, sent, submit } = setup(1)
    submit('a')
    submit('b')
    submit('b')
    gate.settle('a')
    gate.settle('b')
    expect(sent).toEqual(['a', 'b'])
  })
})
