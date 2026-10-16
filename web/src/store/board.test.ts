import { beforeEach, describe, expect, it } from 'vitest'
import { simplify, smoothPath } from '~/lib/geometry'
import { fromTemplate } from '~/lib/templates'
import { frameContents, selectedNodes, strokeNear, useBoard } from './board'

const s = () => useBoard.getState()

beforeEach(() => {
  s().hydrate(fromTemplate('roadtrip', { id: 't' }), 'local')
})

describe('selection', () => {
  it('copies, pastes with fresh ids and keeps edges between copies', () => {
    s().set({ sel: { nodes: ['d1', 'd2'] } })
    const clip = s().copySelection()!
    expect(clip.nodes.map((n) => n.id)).toEqual(['d1', 'd2'])
    expect(clip.edges).toHaveLength(1)

    const before = s().board!.nodes.length
    s().paste(clip, { x: 5000, y: 5000 })
    const b = s().board!
    expect(b.nodes).toHaveLength(before + 2)
    const pasted = selectedNodes(s().sel)
    expect(pasted).toHaveLength(2)
    expect(pasted).not.toContain('d1')
    expect(Math.min(...b.nodes.filter((n) => pasted.includes(n.id)).map((n) => n.x))).toBe(5000)
    expect(b.edges.some((e) => pasted.includes(e.from) && pasted.includes(e.to))).toBe(true)
  })

  it('drops people the target board does not have', () => {
    s().set({ sel: { nodes: ['tra'] } })
    const clip = s().copySelection()!
    s().change((b) => ({ ...b, people: b.people.slice(0, 1), splitN: 1 }))
    s().paste(clip)
    const copy = s().board!.nodes.find((n) => n.id === selectedNodes(s().sel)[0])!
    expect(copy.type === 'section' && copy.items.every((i) => i.payer === 0)).toBe(true)
  })

  it('deletes several cards and their edges in one undo step', () => {
    s().set({ sel: { nodes: ['map', 'd1'] } })
    s().deleteSelection()
    const b = s().board!
    expect(b.nodes.some((n) => n.id === 'map' || n.id === 'd1')).toBe(false)
    expect(b.edges.some((e) => ['map', 'd1'].includes(e.from) || ['map', 'd1'].includes(e.to))).toBe(false)
    s().undo()
    expect(s().board!.nodes.some((n) => n.id === 'map')).toBe(true)
  })
})

describe('drawing', () => {
  it('erases strokes near the eraser only', () => {
    s().change((b) => ({ ...b, strokes: [{ id: 'a', pts: [[0, 0], [100, 0]], color: '' }, { id: 'b', pts: [[0, 50], [100, 50]], color: '' }] }))
    expect(s().eraseAt(50, 5, 8)).toBe(true)
    expect(s().board!.strokes.map((k) => k.id)).toEqual(['b'])
    expect(s().eraseAt(50, 20, 8)).toBe(false)
    expect(strokeNear([[0, 0]], 3, 4, 5)).toBe(true)
  })

  it('simplifies and smooths pen strokes', () => {
    const line: Array<[number, number]> = Array.from({ length: 20 }, (_, i) => [i, 0])
    expect(simplify(line, 0.5)).toEqual([[0, 0], [19, 0]])
    expect(smoothPath([[0, 0], [10, 10], [20, 0]])).toBe('M0,0 Q10,10 15,5 L20,0')
  })
})

describe('colours and comments', () => {
  it('colours every selected card in one undo step', () => {
    s().set({ sel: { nodes: ['d1', 'd2'] } })
    const steps = s().past.length
    s().setColor('mint')
    expect(s().board!.nodes.filter((n) => n.color === 'mint').map((n) => n.id)).toEqual(['d1', 'd2'])
    expect(s().past.length).toBe(steps + 1)
    s().setColor('mint')
    expect(s().past.length).toBe(steps + 1)
    s().undo()
    expect(s().board!.nodes.some((n) => n.color === 'mint')).toBe(false)
  })

  it('adds a comment as the current person, logs it, and deletes it', () => {
    s().setMe(1)
    s().addComment('d1', '  Book early?  ')
    s().addComment('d1', '   ')
    const n = s().board!.nodes.find((x) => x.id === 'd1')!
    expect(n.comments).toHaveLength(1)
    expect(n.comments[0]).toMatchObject({ who: s().board!.people[1]!.name, text: 'Book early?' })
    expect(s().board!.activity[0]!.msg).toBe(`commented on ${n.title}`)
    s().deleteComment('d1', n.comments[0]!.id)
    expect(s().board!.nodes.find((x) => x.id === 'd1')!.comments).toEqual([])
    s().undo()
    expect(s().board!.nodes.find((x) => x.id === 'd1')!.comments).toHaveLength(1)
  })
})

describe('frames', () => {
  it('finds the cards and drawings wholly inside a frame', () => {
    s().addNode('frame', { x: 0, y: 0 })
    const id = selectedNodes(s().sel)[0]!
    s().change((b) => ({
      ...b,
      nodes: b.nodes.map((n) => (n.id === id ? { ...n, x: -2000, y: -2000, w: 700 } : n)),
      strokes: [
        { id: 'in', pts: [[-1900, -1900], [-1800, -1850]], color: '' },
        { id: 'out', pts: [[-1900, -1900], [0, 0]], color: '' },
      ],
    }))
    s().addNode('sticky', { x: -1800, y: -1700 })
    const inside = selectedNodes(s().sel)[0]!
    s().addNode('note', { x: -1400, y: -1700 })
    const across = selectedNodes(s().sel)[0]!
    const sizes = { [inside]: { w: 200, h: 180 }, [across]: { w: 260, h: 200 } }
    const got = frameContents(s().board!, sizes, [id])
    expect(got.nodes).toEqual([inside])
    expect(got.strokes).toEqual(['in'])
    expect(frameContents(s().board!, sizes, [inside])).toEqual({ nodes: [], strokes: [] })
  })
})
