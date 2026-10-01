// Read each session once, including children that the TUI has never opened.
export async function readTree(client, sessionID, signal) {
  const sessions = new Map()
  const root = await client.session.get({ sessionID }, { signal, throwOnError: true })
  if (!root.data) throw new Error('Session unavailable')
  sessions.set(sessionID, root.data)
  let pending = [sessionID]
  const visited = new Set()
  while (pending.length) {
    if (signal?.aborted) throw new Error('Cancelled')
    const batch = [...new Set(pending.splice(0, 8))].filter(id => !visited.has(id))
    for (const id of batch) visited.add(id)
    const results = await Promise.all(batch.map(id =>
      client.session.children({ sessionID: id }, { signal, throwOnError: true }),
    ))
    for (const result of results) {
      if (!Array.isArray(result.data)) throw new Error('Child sessions unavailable')
      for (const child of result.data) {
        sessions.set(child.id, child)
        if (!visited.has(child.id)) pending.push(child.id)
      }
    }
  }
  return sessions
}

export function totalSpend(sessions, rootID) {
  const children = new Map()
  for (const session of sessions.values()) {
    const siblings = children.get(session.parentID) ?? []
    siblings.push(session.id)
    children.set(session.parentID, siblings)
  }
  let total = 0
  const seen = new Set()
  const pending = [rootID]
  while (pending.length) {
    const id = pending.pop()
    if (seen.has(id)) continue
    seen.add(id)
    const session = sessions.get(id)
    if (!session || !Number.isFinite(session.cost)) throw new Error('Session cost unavailable')
    total += session.cost
    pending.push(...(children.get(id) ?? []))
  }
  return total
}
