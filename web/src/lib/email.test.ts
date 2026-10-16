import { describe, expect, it } from 'vitest'
import { inboxAddress, looksLikeEmail, parseEmail } from './email'

const PLAIN = `From: =?utf-8?Q?Ana_Kova=C4=8D?= <ana@mail.com>
To: board-trip@in.example.com
Subject: Your stay at Casa Alfama
Date: Mon, 4 Oct 2026 09:30:00 +0000
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

Check-in Jun 12 from 15:00.=0ASee you soon=21
`

const MULTI = `From: hotel@example.com
Subject: =?UTF-8?B?Qm9va2luZyDinJM=?=
Content-Type: multipart/alternative; boundary="b1"

--b1
Content-Type: text/plain; charset=utf-8

Plain body
--b1
Content-Type: text/html; charset=utf-8

<p>HTML body</p>
--b1--
`

describe('parseEmail', () => {
  it('decodes headers and a quoted-printable body', () => {
    const m = parseEmail(PLAIN)
    expect(m.from).toBe('Ana Kovač <ana@mail.com>')
    expect(m.subject).toBe('Your stay at Casa Alfama')
    expect(m.body).toBe('Check-in Jun 12 from 15:00.\nSee you soon!')
  })

  it('prefers the plain part of a multipart message', () => {
    const m = parseEmail(MULTI)
    expect(m.subject).toBe('Booking ✓')
    expect(m.body).toBe('Plain body')
  })

  it('tells emails from other pasted text', () => {
    expect(looksLikeEmail(PLAIN)).toBe(true)
    expect(looksLikeEmail('Sunset at the viewpoint, then dinner')).toBe(false)
    expect(inboxAddress('AbC1', 'in.example.com')).toBe('board-abc1@in.example.com')
    expect(inboxAddress('abc', null)).toBeNull()
  })
})
