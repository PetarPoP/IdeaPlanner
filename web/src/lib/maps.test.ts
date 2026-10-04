import { describe, expect, it } from 'vitest'
import { parseMapInput } from './maps'

describe('parseMapInput', () => {
  it('turns typed stops into a directions embed', () => {
    const m = parseMapInput('Lisbon → Sintra -> Lagos')
    expect(m.stops).toEqual(['Lisbon', 'Sintra', 'Lagos'])
    expect(m.src).toContain('saddr=Lisbon')
    expect(m.src).toContain('daddr=Sintra+to:Lagos')
  })

  it('reads a Google Maps directions URL', () => {
    const m = parseMapInput('https://www.google.com/maps/dir/Lisbon/Sintra,+Portugal/@38.7,-9.1,10z')
    expect(m.stops).toEqual(['Lisbon', 'Sintra, Portugal'])
  })

  it('accepts embed code only from Google', () => {
    expect(parseMapInput('<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>').src).toBe('https://www.google.com/maps/embed?pb=1')
    expect(parseMapInput('<iframe src="https://evil.example/x"></iframe>').src).toBeUndefined()
  })

  it('explains short links and empty input', () => {
    expect(parseMapInput('https://maps.app.goo.gl/abc').msg).toMatch(/Short share links/)
    expect(parseMapInput('  ').msg).toBeTruthy()
  })

  it('searches a single place', () => {
    const m = parseMapInput('Zagreb Upper Town')
    expect(m.stops).toEqual(['Zagreb Upper Town'])
    expect(m.open).toContain('query=Zagreb%20Upper%20Town')
  })
})
