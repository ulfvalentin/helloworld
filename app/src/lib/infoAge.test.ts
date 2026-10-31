import { describe, expect, it } from 'vitest'
import { formatDate, infoAge } from './infoAge'

describe('infoAge', () => {
  const now = new Date('2026-10-31T10:00:00Z')
  it('frisch: unter 6 Monaten', () => {
    expect(infoAge({ info_updated_at: '2026-05-02T08:00:00Z', updated_at: '2026-10-30T00:00:00Z' }, now)).toEqual({ date: '2026-05-02', stale: false })
  })
  it('veraltet: über 6 Monate (info_updated_at hat Vorrang vor updated_at)', () => {
    expect(infoAge({ info_updated_at: '2026-04-01T08:00:00Z', updated_at: '2026-10-30T00:00:00Z' }, now).stale).toBe(true)
  })
  it('ältere Einträge ohne info_updated_at zählen ab updated_at', () => {
    expect(infoAge({ updated_at: '2025-01-15T00:00:00Z' }, now)).toEqual({ date: '2025-01-15', stale: true })
  })
  it('formatiert deutsch', () => expect(formatDate('2026-10-12')).toBe('12.10.2026'))
})
