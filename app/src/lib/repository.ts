import { classify } from './classify'
import { supabase } from './supabase'
import type { ConfirmationInput, ManufacturerConfirmation, Product, ProductInput } from '../types'

export interface Repository {
  mode: 'supabase' | 'local'
  listProducts(search?: string): Promise<Product[]>
  getById(id: string): Promise<Product | null>
  getByBarcode(barcode: string): Promise<Product | null>
  /** Legt an oder aktualisiert (per `id` bzw. Barcode) und speichert die aktuelle Einstufung. */
  saveProduct(input: ProductInput, id?: string): Promise<Product>
  addConfirmation(productId: string, input: ConfirmationInput): Promise<Product>
  recordScan(productId: string, ocrText: string | null): Promise<void>
}

/** Stuft ein Produkt anhand seiner gespeicherten Daten neu ein (Bestätigungen altern!). */
export function withStatus<T extends Omit<Product, 'status' | 'status_reasons'>>(p: T): T & Pick<Product, 'status' | 'status_reasons'> {
  const c = classify({
    ingredientsText: p.ingredients_text,
    labelText: p.label_text,
    certifiedLabel: p.certified_label,
    confirmations: p.confirmations,
  })
  return { ...p, status: c.status, status_reasons: c.reasons }
}

function matches(p: Product, search?: string): boolean {
  if (!search) return true
  const q = search.toLowerCase()
  return [p.name, p.brand, p.barcode].some((v) => v?.toLowerCase().includes(q))
}

// ---------------------------------------------------------------- Supabase

const SELECT = '*, confirmations:manufacturer_confirmations(*)'

function fromRow(row: Record<string, unknown>): Product {
  const confirmations = ((row.confirmations as ManufacturerConfirmation[]) ?? []).sort((a, b) =>
    b.confirmed_at.localeCompare(a.confirmed_at),
  )
  return withStatus({ ...(row as unknown as Product), confirmations })
}

function supabaseRepository(): Repository {
  const db = supabase!
  const repo: Repository = {
    mode: 'supabase',
    async listProducts(search) {
      let q = db.from('products').select(SELECT).order('updated_at', { ascending: false }).limit(200)
      if (search) {
        const s = search.replace(/[%,()]/g, ' ')
        q = q.or(`name.ilike.%${s}%,brand.ilike.%${s}%,barcode.eq.${s}`)
      }
      const { data, error } = await q
      if (error) throw error
      return data.map(fromRow)
    },
    async getById(id) {
      const { data, error } = await db.from('products').select(SELECT).eq('id', id).maybeSingle()
      if (error) throw error
      return data ? fromRow(data) : null
    },
    async getByBarcode(barcode) {
      const { data, error } = await db.from('products').select(SELECT).eq('barcode', barcode).maybeSingle()
      if (error) throw error
      return data ? fromRow(data) : null
    },
    async saveProduct(input, id) {
      const existing = id ? await repo.getById(id) : input.barcode ? await repo.getByBarcode(input.barcode) : null
      const { status, status_reasons } = withStatus({
        ...input,
        id: '',
        created_at: '',
        updated_at: '',
        confirmations: existing?.confirmations ?? [],
      })
      const write = (row: Record<string, unknown>) =>
        existing
          ? db.from('products').update(row).eq('id', existing.id).select('id').single()
          : db.from('products').insert(row).select('id').single()
      const row = { ...input, status, status_reasons, info_updated_at: new Date().toISOString() }
      let { data, error } = await write(row)
      if (error && /info_updated_at/.test(error.message)) {
        // Datenbank noch ohne die Spalte aus 20261101000000_product_info_date.sql
        const { info_updated_at: _t, ...legacy } = row
        ;({ data, error } = await write(legacy))
      }
      if (error || !data) throw error ?? new Error('Speichern fehlgeschlagen')
      return (await repo.getById(data.id))!
    },
    async addConfirmation(productId, input) {
      let { error } = await db.from('manufacturer_confirmations').insert({ ...input, product_id: productId })
      if (error && /contact_(name|email)/.test(error.message)) {
        // Datenbank noch ohne die Spalten aus 20261031000000_confirmation_contact_fields.sql: alles in `contact` ablegen
        const { contact_name, contact_email, contact, ...rest } = input
        ;({ error } = await db.from('manufacturer_confirmations').insert({
          ...rest,
          contact: [contact_name, contact_email, contact].filter(Boolean).join(' · ') || null,
          product_id: productId,
        }))
      }
      if (error) throw error
      const product = (await repo.getById(productId))!
      // gespeicherten Status aktualisieren, damit Listen/Abfragen in der DB stimmen
      await db.from('products').update({ status: product.status, status_reasons: product.status_reasons }).eq('id', productId)
      return product
    },
    async recordScan(productId, ocrText) {
      await db.from('scans').insert({ product_id: productId, ocr_text: ocrText })
    },
  }
  return repo
}

// ---------------------------------------------------------------- lokal (Demo)

const KEY = 'glutencheck.products.v1'

function load(): Product[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

function store(products: Product[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(products))
  } catch {
    // Speicher voll oder gesperrt – Demo-Modus arbeitet dann nur im Speicher
  }
}

function localRepository(): Repository {
  return {
    mode: 'local',
    async listProducts(search) {
      return load()
        .map(withStatus)
        .filter((p) => matches(p, search))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    },
    async getById(id) {
      const p = load().find((x) => x.id === id)
      return p ? withStatus(p) : null
    },
    async getByBarcode(barcode) {
      const p = load().find((x) => x.barcode === barcode)
      return p ? withStatus(p) : null
    },
    async saveProduct(input, id) {
      const all = load()
      const now = new Date().toISOString()
      const idx = all.findIndex((x) => (id ? x.id === id : input.barcode && x.barcode === input.barcode))
      const base = idx >= 0 ? all[idx] : { id: crypto.randomUUID(), created_at: now, confirmations: [] }
      const product = withStatus({ ...base, ...input, updated_at: now, info_updated_at: now } as Product)
      if (idx >= 0) all[idx] = product
      else all.push(product)
      store(all)
      return product
    },
    async addConfirmation(productId, input) {
      const all = load()
      const p = all.find((x) => x.id === productId)
      if (!p) throw new Error('Produkt nicht gefunden')
      p.confirmations = [
        { ...input, id: crypto.randomUUID(), product_id: productId, created_at: new Date().toISOString() },
        ...p.confirmations,
      ].sort((a, b) => b.confirmed_at.localeCompare(a.confirmed_at))
      p.updated_at = new Date().toISOString()
      Object.assign(p, withStatus(p))
      store(all)
      return p
    },
    async recordScan() {},
  }
}

export const repository: Repository = supabase ? supabaseRepository() : localRepository()
