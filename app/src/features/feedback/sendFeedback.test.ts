import { describe, expect, it, vi } from 'vitest'
import { type SendDeps, sendFeedback } from './sendFeedback'

const input = { message: 'Hallo', page: 'scan', email: 'a@b.de' }
const deps = (over: Partial<SendDeps> = {}): SendDeps => ({
  addFeedback: vi.fn().mockResolvedValue(undefined),
  getToken: vi.fn().mockResolvedValue('tok'),
  post: vi.fn().mockResolvedValue(true),
  ...over,
})

describe('sendFeedback', () => {
  it('schreibt in die Datenbank und legt ein Issue an', async () => {
    const d = deps()
    expect(await sendFeedback(input, d)).toEqual({ database: true, issue: true })
    expect(d.post).toHaveBeenCalledWith('tok', input)
  })

  it('genügt ein Weg: Datenbank fehlt, Issue klappt', async () => {
    const d = deps({ addFeedback: vi.fn().mockRejectedValue(new Error('Tabelle fehlt')) })
    expect(await sendFeedback(input, d)).toEqual({ database: false, issue: true })
  })

  it('genügt ein Weg: GitHub nicht eingerichtet, Datenbank klappt', async () => {
    const d = deps({ post: vi.fn().mockResolvedValue(false) })
    expect(await sendFeedback(input, d)).toEqual({ database: true, issue: false })
  })

  it('ohne Anmeldung kein Issue, aber die Datenbank', async () => {
    const d = deps({ getToken: vi.fn().mockResolvedValue(null) })
    expect(await sendFeedback(input, d)).toEqual({ database: true, issue: false })
    expect(d.post).not.toHaveBeenCalled()
  })

  it('beide scheitern: Fehler der Datenbank', async () => {
    const d = deps({ addFeedback: vi.fn().mockRejectedValue(new Error('Tabelle fehlt')), post: vi.fn().mockResolvedValue(false) })
    await expect(sendFeedback(input, d)).rejects.toThrow('Tabelle fehlt')
  })
})
