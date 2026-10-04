import { describe, expect, it } from 'vitest'
import { edgePath, fitView, zoomAt } from './geometry'
import { drawNames } from './santa'
import { TEMPLATES, fromTemplate, newCard } from './templates'

describe('drawNames', () => {
  it('never pairs someone with themselves', () => {
    for (let n = 2; n <= 8; n++) {
      for (let k = 0; k < 50; k++) {
        const pairs = drawNames(n)
        expect([...pairs].sort()).toEqual([...Array(n).keys()])
        expect(pairs.every((r, g) => r !== g)).toBe(true)
      }
    }
  })
})

describe('geometry', () => {
  it('connects side by side cards horizontally', () => {
    expect(edgePath({ x: 0, y: 0, w: 100, h: 100 }, { x: 300, y: 0, w: 100, h: 100 })).toMatch(/^M100,50 C/)
  })

  it('keeps the zoom anchor fixed', () => {
    const v = zoomAt({ x: 0, y: 0, z: 1 }, 2, 100, 100)
    expect(v).toEqual({ z: 2, x: -100, y: -100 })
  })

  it('fits boxes inside the padded viewport', () => {
    const v = fitView([{ x: 0, y: 0, w: 1000, h: 500 }], 1040, 680, { side: 20, top: 80, bottom: 100 })!
    expect(v.z).toBeCloseTo(1)
    expect(v.x).toBeCloseTo(20)
  })
})

describe('templates', () => {
  it('only reference people that exist', () => {
    for (const t of TEMPLATES) {
      const b = fromTemplate(t.key, { id: 'x' })
      const ids = new Set(b.nodes.map((n) => n.id))
      expect(ids.size).toBe(b.nodes.length)
      expect(b.edges.every((e) => ids.has(e.from) && ids.has(e.to))).toBe(true)
      const refs = b.nodes.flatMap((n) =>
        n.type === 'section' ? n.items.map((i) => i.payer) : n.type === 'checklist' ? n.items.flatMap((i) => (i.who == null ? [] : [i.who])) : [],
      )
      expect(refs.every((r) => r < b.people.length)).toBe(true)
    }
  })

  it('keeps the board id and people when switching', () => {
    const people = fromTemplate('blank', { id: 'a' }).people
    const b = fromTemplate('santa', { id: 'a', people, splitN: 4 })
    expect(b.id).toBe('a')
    expect(b.splitN).toBe(4)
  })

  it('creates cards with fresh ids', () => {
    expect(newCard('note').id).not.toBe(newCard('note').id)
  })
})
