import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSavedList,
  getSavedList,
  listSavedLists,
  parseSavedList,
  savedListErrorMessage,
} from './savedListsApi'

const rpc = vi.fn()

vi.mock('./supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}))

const list = {
  id: 'list-1',
  name: 'Favorites',
  entry_count: 3,
  manhwa_ids: [11, 22, 33],
  created_at: '2026-08-11T00:00:00Z',
  updated_at: '2026-08-11T00:00:00Z',
}

describe('saved lists API', () => {
  beforeEach(() => rpc.mockReset())

  it('parses owner-only list entries', () => {
    expect(parseSavedList(list)).toMatchObject({
      id: 'list-1',
      name: 'Favorites',
      entryCount: 3,
      manhwaIds: [11, 22, 33],
    })
    expect(parseSavedList({ ...list, manhwa_ids: [11, '22'] })).toBeNull()
  })

  it('lists metadata without requiring title ids', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, lists: [{ ...list, manhwa_ids: undefined }] },
      error: null,
    })
    const result = await listSavedLists()
    expect(result).toMatchObject({
      ok: true,
      value: [{ id: 'list-1', entryCount: 3 }],
    })
    expect(rpc).toHaveBeenCalledWith('saved_list_list_mine', {})
  })

  it('gets and creates catalog-id lists through scoped RPCs', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, list }, error: null })
    expect(await getSavedList('list-1')).toMatchObject({
      ok: true,
      value: { manhwaIds: [11, 22, 33] },
    })
    expect(rpc).toHaveBeenLastCalledWith('saved_list_get', {
      p_list_id: 'list-1',
    })

    rpc.mockResolvedValueOnce({ data: { ok: true, list }, error: null })
    await createSavedList({
      name: 'Favorites',
      manhwaIds: [11, 22, 33],
      idempotencyKey: 'create-list:test',
    })
    expect(rpc).toHaveBeenLastCalledWith('saved_list_create', {
      p_name: 'Favorites',
      p_manhwa_ids: [11, 22, 33],
      p_idempotency_key: 'create-list:test',
    })
  })

  it('uses privacy-safe error copy', () => {
    expect(savedListErrorMessage('list_not_found')).not.toMatch(/owner|user/i)
    expect(savedListErrorMessage('unknown_internal_detail')).toBe(
      'That list request could not be completed.',
    )
  })
})
