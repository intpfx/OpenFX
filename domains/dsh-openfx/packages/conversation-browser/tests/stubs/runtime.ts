/** Minimal client store runtime used only by this package's source tests. */
export interface EngineStoreHandle<State, Actions extends Record<string, (...args: never[]) => void>> {
  spec: {
    init: () => State
    actions: Actions
  }
  create: (scope?: string) => {
    actions: { [Key in keyof Actions]: (...args: Parameters<Actions[Key]> extends [State, ...infer Rest] ? Rest : never) => void }
    getSnapshot: () => State
    subscribe: (listener: () => void) => () => void
  }
}

export type SessionListState = never

export function defineStore<State, Actions extends Record<string, (draft: State, ...args: never[]) => void>>(
  spec: { init: () => State; actions: Actions },
): EngineStoreHandle<State, Actions> {
  return {
    spec,
    create: () => {
      let state = structuredClone(spec.init())
      const listeners = new Set<() => void>()
      const actions = Object.fromEntries(Object.entries(spec.actions).map(([key, action]) => [
        key,
        (...args: never[]) => {
          const next = structuredClone(state)
          action(next, ...args)
          state = next
          for (const listener of listeners) listener()
        },
      ]))
      return {
        actions: actions as never,
        getSnapshot: () => state,
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      }
    },
  }
}
