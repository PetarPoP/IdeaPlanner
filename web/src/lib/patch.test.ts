import { describe, expect, it } from 'vitest'
import { applyPatch, diff, isEmptyPatch } from './patch'
import { fromTemplate } from './templates'

describe('patch', () => {
  const base = fromTemplate('roadtrip', { id: 'b' })

  it('round-trips a change', () => {
    const [first, ...rest] = base.nodes
    const next = { ...base, title: 'Trip', nodes: [...rest, { ...first!, x: first!.x + 40 }], strokes: [{ id: 's', pts: [[0, 0] as [number, number]], color: '' }] }
    const p = diff(base, next)
    expect(p.set).toEqual({ title: 'Trip' })
    expect(p.upsert?.nodes).toHaveLength(1)
    const got = applyPatch(base, p)
    expect(got.title).toBe('Trip')
    expect(got.nodes.find((n) => n.id === first!.id)!.x).toBe(first!.x + 40)
    expect(got.strokes).toHaveLength(1)
    expect(isEmptyPatch(diff(base, base))).toBe(true)
  })

  it('keeps both of two edits to different cards', () => {
    const [a, b] = base.nodes
    const mine = diff(base, { ...base, nodes: base.nodes.map((n) => (n.id === a!.id ? { ...n, x: 1 } : n)) })
    const theirs = diff(base, { ...base, nodes: base.nodes.filter((n) => n.id !== b!.id) })
    const merged = applyPatch(applyPatch(base, mine), theirs)
    expect(merged.nodes.find((n) => n.id === a!.id)!.x).toBe(1)
    expect(merged.nodes.some((n) => n.id === b!.id)).toBe(false)
  })
})
