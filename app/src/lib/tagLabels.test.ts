import { describe, expect, it } from 'vitest'
import { tagNames } from './tagLabels'

describe('tagNames', () => {
  it('übersetzt bekannte Tags und formatiert unbekannte', () => {
    expect(tagNames(['allergens:en:gluten', 'allergens:en:soybeans', 'traces:en:sesame-seeds', 'allergens:en:foo-bar'], 'allergens')).toEqual(['Gluten', 'Soja', 'Foo bar'])
    expect(tagNames(['traces:en:sesame-seeds'], 'traces')).toEqual(['Sesam'])
  })
})
