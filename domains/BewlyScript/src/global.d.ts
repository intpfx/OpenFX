export {}

declare global {
  const __DEV__: boolean
}

declare module '*.vue' {
  const component: any
  export default component
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $t: (key: string, arg1?: Record<string, string | number> | string | number, arg2?: Record<string, string | number> | string | number) => string
  }
}
