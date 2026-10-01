import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readTree, totalSpend } from '../src/spend.js'

const rows = [
  { id: 'root', cost: 10 },
  { id: 'child', parentID: 'root', cost: 20 },
  { id: 'grandchild', parentID: 'child', cost: 30 },
  { id: 'great-grandchild', parentID: 'grandchild', cost: 40 },
  { id: 'other', cost: 999 },
]
function client(children) {
  return { session: {
    get: async ({sessionID}) => ({data: rows.find(s => s.id === sessionID)}),
    children: children ?? (async ({sessionID}) => ({data: rows.filter(s => s.parentID === sessionID)})),
  } }
}
test('fetches unopened descendants through every nesting level', async () => {
  const tree = await readTree(client(), 'root')
  assert.equal(tree.size, 4)
  assert.equal(totalSpend(tree, 'root'), 100)
  assert.equal(totalSpend(tree, 'child'), 90)
})
test('replaces cumulative costs instead of adding them again; excludes unrelated sessions', () => {
  const tree = new Map(rows.map(s => [s.id, s]))
  tree.set('child', {...rows[1], cost: 25})
  tree.set('child', {...rows[1], cost: 25})
  assert.equal(totalSpend(tree, 'root'), 105)
})
test('failed child fetch does not produce a plausible partial total', async () => {
  await assert.rejects(readTree(client(async () => ({error: 'offline'})), 'root'))
})
test('missing pricing is not silently converted to zero', () => {
  assert.throws(() => totalSpend(new Map([['root', {id: 'root'}]]), 'root'))
  assert.equal(totalSpend(new Map([['root', {id: 'root', cost: 0}]]), 'root'), 0)
})
test('duplicate child listings are fetched and counted once', async () => {
  let reads = 0
  const tree = await readTree(client(async ({sessionID}) => {
    reads++
    const children = rows.filter(s => s.parentID === sessionID)
    return {data: [...children, ...children]}
  }), 'root')
  assert.equal(totalSpend(tree, 'root'), 100)
  assert.equal(reads, 4)
})
