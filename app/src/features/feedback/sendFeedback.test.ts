import { describe, expect, it, vi } from 'vitest'
import { type SendDeps, sendFeedback } from './sendFeedback'

const input = { message: 'Hallo', page: 'scan', email: 'a@b.de' }
const deps = (over: Partial<SendDeps> = {}): SendDeps => ({
  getToken: vi.fn().mockResolvedValue('tok'),
  post: vi.fn().mockResolvedValue({ ok: true }),
  ...over,
})

describe('sendFeedback', () => {
  it('sendet mit dem Anmelde-Token', async () => {
    const d = deps()
    await sendFeedback(input, d)
    expect(d.post).toHaveBeenCalledWith('tok', input)
  })

  it('ohne Anmeldung: verständlicher Fehler, nichts wird gesendet', async () => {
    const d = deps({ getToken: vi.fn().mockResolvedValue(null) })
    await expect(sendFeedback(input, d)).rejects.toThrow('anmelden')
    expect(d.post).not.toHaveBeenCalled()
  })

  it('reicht die Begründung der Funktion durch', async () => {
    const d = deps({ post: vi.fn().mockResolvedValue({ ok: false, error: 'GitHub hat das Feedback nicht angenommen (403: Resource not accessible)' }) })
    await expect(sendFeedback(input, d)).rejects.toThrow('403')
  })
})
