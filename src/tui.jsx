import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { readTree, totalSpend } from './spend.js'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const builtin = 'internal:sidebar-context'

function Spend(props) {
  const [total, setTotal] = createSignal()
  createEffect(() => {
    const sessionID = props.sessionID
    const api = props.api
    const abort = new AbortController()
    let sessions = new Map()
    let changes = new Map()
    let loading = false
    let timer
    let disposed = false
    setTotal(undefined)

    const publish = () => {
      try { setTotal(money.format(totalSpend(sessions, sessionID))) }
      catch { setTotal('unavailable') }
    }
    const refresh = async () => {
      if (loading || disposed) return
      loading = true
      changes = new Map()
      try {
        const snapshot = await readTree(api.client, sessionID, abort.signal)
        if (disposed) return
        // Events received during the fetch are newer than its snapshot.
        for (const [id, session] of changes) {
          if (session) snapshot.set(id, session)
          else snapshot.delete(id)
        }
        sessions = snapshot
        publish()
      } catch {
        if (!disposed) setTotal('unavailable')
      } finally { loading = false }
    }
    const schedule = () => {
      if (timer || disposed) return
      timer = setTimeout(() => { timer = undefined; void refresh() }, 1000)
    }
    const update = event => {
      const session = event.properties.info
      // Retain ancestry even if events arrive child-first.
      sessions.set(session.id, session)
      if (loading) changes.set(session.id, session)
      if (!loading) publish()
    }
    const offUpdate = api.event.on('session.updated', update)
    const offCreate = api.event.on('session.created', event => { update(event); schedule() })
    const offDelete = api.event.on('session.deleted', event => {
      const id = event.properties.info.id
      sessions.delete(id)
      if (loading) changes.set(id, null)
      if (!loading) publish()
    })
    void refresh()
    // Recover after reconnects and discover any events missed while detached.
    const interval = setInterval(refresh, 60000)
    onCleanup(() => {
      disposed = true
      abort.abort()
      clearTimeout(timer)
      clearInterval(interval)
      offUpdate(); offCreate(); offDelete()
    })
  })
  return <text fg={props.api.theme.current.textMuted}>Σ {total() ?? '…'}</text>
}

// Context layout and token calculation follow OpenCode v1.18.34 (MIT).
function Context(props) {
  const api = props.api
  const theme = () => api.theme.current
  const context = createMemo(() => {
    const last = api.state.session.messages(props.sessionID)
      .findLast(item => item.role === 'assistant' && item.tokens.output > 0)
    if (!last) return { tokens: 0, percent: 0 }
    const t = last.tokens
    const tokens = t.input + t.output + t.reasoning + t.cache.read + t.cache.write
    const model = api.state.provider.find(item => item.id === last.providerID)?.models[last.modelID]
    return { tokens, percent: model?.limit.context ? Math.round(tokens / model.limit.context * 100) : 0 }
  })
  return <box>
    <text fg={theme().text}><b>Context</b></text>
    <text fg={theme().textMuted}>{context().tokens.toLocaleString()} tokens</text>
    <text fg={theme().textMuted}>{context().percent}% used</text>
    <text fg={theme().textMuted}>{money.format(api.state.session.get(props.sessionID)?.cost ?? 0)} spent</text>
    <Spend api={api} sessionID={props.sessionID} />
  </box>
}

export default {
  id: 'opencode-total-spend',
  async tui(api) {
    api.slots.register({
      order: 100,
      slots: {
        sidebar_content(_ctx, props) {
          return <Context api={api} sessionID={props.session_id} />
        },
      },
    })
    const original = api.plugins.list().find(plugin => plugin.id === builtin)
    if (original?.active) {
      await api.plugins.deactivate(builtin)
      api.lifecycle.onDispose(() => api.plugins.activate(builtin))
    }
  },
}
