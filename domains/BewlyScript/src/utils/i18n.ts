import type { App, WritableComputedRef } from 'vue'
import { computed, ref } from 'vue'

import localeText from '~/_locales/cmn-CN.yml?raw'

interface LocaleNode {
  [key: string]: LocaleNode | string
}

type LocaleValue = LocaleNode | string
type TranslateParams = Record<string, string | number>
type TranslateArg = TranslateParams | string | number | undefined

const apostrophe = String.fromCharCode(39)
const quote = String.fromCharCode(34)
const carriageReturn = String.fromCharCode(13)
const lineFeed = String.fromCharCode(10)
const currentLocale = ref('cmn-CN')
const messages = parseLocaleMessages(localeText)

function parseLocaleMessages(source: string): LocaleNode {
  const root: LocaleNode = {}
  const stack: Array<{ indent: number, node: LocaleNode }> = [{ indent: -1, node: root }]
  const lines = source.split(lineFeed).map(line => line.endsWith(carriageReturn) ? line.slice(0, -1) : line)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue

    const indent = countLeadingSpaces(line)
    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent)
      stack.pop()

    const separatorIndex = trimmed.indexOf(':')
    if (separatorIndex < 0)
      continue

    const key = trimmed.slice(0, separatorIndex).trim()
    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    const currentNode = stack[stack.length - 1]!.node

    if (!rawValue) {
      const childNode: LocaleNode = {}
      currentNode[key] = childNode
      stack.push({ indent, node: childNode })
      continue
    }

    if (rawValue === '|' || rawValue === '|-' || rawValue === '>') {
      const blockIndent = indent + 2
      const blockLines: string[] = []

      while (index + 1 < lines.length) {
        const nextLine = lines[index + 1] ?? ''
        const nextTrimmed = nextLine.trim()
        const nextIndent = countLeadingSpaces(nextLine)
        if (nextTrimmed && nextIndent < blockIndent)
          break

        index += 1
        blockLines.push(nextLine.startsWith(' '.repeat(blockIndent)) ? nextLine.slice(blockIndent) : '')
      }

      currentNode[key] = normalizeBlockValue(rawValue, blockLines)
      continue
    }

    currentNode[key] = stripWrappingQuotes(rawValue)
  }

  return root
}

function countLeadingSpaces(line: string): number {
  let count = 0
  while (count < line.length && line[count] === ' ')
    count += 1
  return count
}

function normalizeBlockValue(marker: string, blockLines: string[]): string {
  const text = marker === '>'
    ? blockLines.map(line => line.trim()).join(' ').trim()
    : blockLines.join(lineFeed).replaceAll(`${lineFeed}${lineFeed}`, `${lineFeed}${lineFeed}`)
  return stripWrappingQuotes(text.replace(new RegExp(`${lineFeed}+$`), ''))
}

function stripWrappingQuotes(value: string): string {
  const firstChar = value[0]
  const lastChar = value.at(-1)
  if ((firstChar === quote || firstChar === apostrophe) && firstChar === lastChar)
    return value.slice(1, -1)
  return value
}

function getMessage(key: string): string | undefined {
  let current: LocaleValue | undefined = messages
  for (const segment of key.split('.')) {
    if (!current || typeof current === 'string')
      return undefined
    current = current[segment]
  }
  return typeof current === 'string' ? current : undefined
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params)
    return template

  let result = ''
  let cursor = 0
  while (cursor < template.length) {
    const open = template.indexOf('{', cursor)
    if (open < 0) {
      result += template.slice(cursor)
      break
    }

    const close = template.indexOf('}', open + 1)
    if (close < 0) {
      result += template.slice(cursor)
      break
    }

    const key = template.slice(open + 1, close)
    result += template.slice(cursor, open)
    result += `${params[key] ?? `{${key}}`}`
    cursor = close + 1
  }

  return result
}

function resolveParams(arg: TranslateArg): TranslateParams | undefined {
  if (typeof arg === 'object' && arg !== null && !Array.isArray(arg))
    return arg
  return undefined
}

export function t(key: string, arg1?: TranslateArg, _arg2?: TranslateArg): string {
  const fallback = typeof arg1 === 'string' ? arg1 : undefined
  const template = getMessage(key) ?? fallback ?? key
  return interpolate(template, resolveParams(arg1))
}

export const locale = computed({
  get: () => currentLocale.value,
  set: value => currentLocale.value = value,
})

export function useI18n(): { t: typeof t, locale: WritableComputedRef<string> } {
  return { t, locale }
}

export const i18n = {
  global: {
    t,
    locale,
  },
  install(app: App) {
    app.config.globalProperties.$t = t
  },
}
