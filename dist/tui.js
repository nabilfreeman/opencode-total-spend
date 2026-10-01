import { createComponent as _$createComponent } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { readTree, totalSpend } from './spend.js';
const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});
const builtin = 'internal:sidebar-context';
function Spend(props) {
  const [total, setTotal] = createSignal();
  createEffect(() => {
    const sessionID = props.sessionID;
    const api = props.api;
    const abort = new AbortController();
    let sessions = new Map();
    let changes = new Map();
    let loading = false;
    let timer;
    let disposed = false;
    setTotal(undefined);
    const publish = () => {
      try {
        setTotal(money.format(totalSpend(sessions, sessionID)));
      } catch {
        setTotal('unavailable');
      }
    };
    const refresh = async () => {
      if (loading || disposed) return;
      loading = true;
      changes = new Map();
      try {
        const snapshot = await readTree(api.client, sessionID, abort.signal);
        if (disposed) return;
        // Events received during the fetch are newer than its snapshot.
        for (const [id, session] of changes) {
          if (session) snapshot.set(id, session);else snapshot.delete(id);
        }
        sessions = snapshot;
        publish();
      } catch {
        if (!disposed) setTotal('unavailable');
      } finally {
        loading = false;
      }
    };
    const schedule = () => {
      if (timer || disposed) return;
      timer = setTimeout(() => {
        timer = undefined;
        void refresh();
      }, 1000);
    };
    const update = event => {
      const session = event.properties.info;
      // Retain ancestry even if events arrive child-first.
      sessions.set(session.id, session);
      if (loading) changes.set(session.id, session);
      if (!loading) publish();
    };
    const offUpdate = api.event.on('session.updated', update);
    const offCreate = api.event.on('session.created', event => {
      update(event);
      schedule();
    });
    const offDelete = api.event.on('session.deleted', event => {
      const id = event.properties.info.id;
      sessions.delete(id);
      if (loading) changes.set(id, null);
      if (!loading) publish();
    });
    void refresh();
    // Recover after reconnects and discover any events missed while detached.
    const interval = setInterval(refresh, 60000);
    onCleanup(() => {
      disposed = true;
      abort.abort();
      clearTimeout(timer);
      clearInterval(interval);
      offUpdate();
      offCreate();
      offDelete();
    });
  });
  return (() => {
    var _el$ = _$createElement("text"),
      _el$2 = _$createTextNode(`Σ `);
    _$insertNode(_el$, _el$2);
    _$insert(_el$, () => total() ?? '…', null);
    _$effect(_$p => _$setProp(_el$, "fg", props.api.theme.current.textMuted, _$p));
    return _el$;
  })();
}

// Context layout and token calculation follow OpenCode v1.18.34 (MIT).
function Context(props) {
  const api = props.api;
  const theme = () => api.theme.current;
  const context = createMemo(() => {
    const last = api.state.session.messages(props.sessionID).findLast(item => item.role === 'assistant' && item.tokens.output > 0);
    if (!last) return {
      tokens: 0,
      percent: 0
    };
    const t = last.tokens;
    const tokens = t.input + t.output + t.reasoning + t.cache.read + t.cache.write;
    const model = api.state.provider.find(item => item.id === last.providerID)?.models[last.modelID];
    return {
      tokens,
      percent: model?.limit.context ? Math.round(tokens / model.limit.context * 100) : 0
    };
  });
  return (() => {
    var _el$3 = _$createElement("box"),
      _el$4 = _$createElement("text"),
      _el$5 = _$createElement("b"),
      _el$7 = _$createElement("text"),
      _el$8 = _$createTextNode(` tokens`),
      _el$9 = _$createElement("text"),
      _el$0 = _$createTextNode(`% used`),
      _el$1 = _$createElement("text"),
      _el$10 = _$createTextNode(` spent`);
    _$insertNode(_el$3, _el$4);
    _$insertNode(_el$3, _el$7);
    _$insertNode(_el$3, _el$9);
    _$insertNode(_el$3, _el$1);
    _$insertNode(_el$4, _el$5);
    _$insertNode(_el$5, _$createTextNode(`Context`));
    _$insertNode(_el$7, _el$8);
    _$insert(_el$7, () => context().tokens.toLocaleString(), _el$8);
    _$insertNode(_el$9, _el$0);
    _$insert(_el$9, () => context().percent, _el$0);
    _$insertNode(_el$1, _el$10);
    _$insert(_el$1, () => money.format(api.state.session.get(props.sessionID)?.cost ?? 0), _el$10);
    _$insert(_el$3, _$createComponent(Spend, {
      api: api,
      get sessionID() {
        return props.sessionID;
      }
    }), null);
    _$effect(_p$ => {
      var _v$ = theme().text,
        _v$2 = theme().textMuted,
        _v$3 = theme().textMuted,
        _v$4 = theme().textMuted;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$4, "fg", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$7, "fg", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$9, "fg", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp(_el$1, "fg", _v$4, _p$.o));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined
    });
    return _el$3;
  })();
}
export default {
  id: 'opencode-total-spend',
  async tui(api) {
    api.slots.register({
      order: 100,
      slots: {
        sidebar_content(_ctx, props) {
          return _$createComponent(Context, {
            api: api,
            get sessionID() {
              return props.session_id;
            }
          });
        }
      }
    });
    const original = api.plugins.list().find(plugin => plugin.id === builtin);
    if (original?.active) {
      await api.plugins.deactivate(builtin);
      api.lifecycle.onDispose(() => api.plugins.activate(builtin));
    }
  }
};
