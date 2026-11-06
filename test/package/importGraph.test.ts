import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const srcDir = fileURLToPath(new URL('../../src/', import.meta.url))

/**
 * Every module a source file loads at runtime: each `import … from` /
 * `export … from` / bare `import '…'`, except `import type` / `export type`.
 * Under `verbatimModuleSyntax` an `import { type A }` still emits an import,
 * so only the whole-statement `type` form is skipped.
 */
function runtimeSpecifiers(file: string): string[] {
  const code = readFileSync(file, 'utf8')
  const found: string[] = []
  const fromRe =
    /^\s*(?:import|export)\s+(?!type\s)[^;'"]*?\bfrom\s+['"]([^'"]+)['"]/gms
  const bareRe = /^\s*import\s+['"]([^'"]+)['"]/gm
  for (const re of [fromRe, bareRe])
    for (const match of code.matchAll(re)) found.push(match[1]!)
  return found
}

/** The runtime closure of `entry`: source files (src-relative) and packages. */
function closure(entry: string) {
  const files = new Set<string>()
  const packages = new Set<string>()
  const queue = [resolve(srcDir, entry)]
  while (queue.length) {
    const file = queue.pop()!
    const key = relative(srcDir, file)
    if (files.has(key)) continue
    files.add(key)
    for (const spec of runtimeSpecifiers(file)) {
      if (!spec.startsWith('.')) {
        packages.add(spec)
        continue
      }
      const target = resolve(dirname(file), spec.replace(/\.js$/, '.ts'))
      if (!existsSync(target)) throw new Error(`unresolved ${spec} in ${key}`)
      queue.push(target)
    }
  }
  return { files, packages }
}

// A read-only app must not ship secp256k1 or the private-key account code:
// building a Client resolves `account` strings as addresses, never as keys.
describe.each([
  'clients/createClient.ts',
  'clients/createPublicClient.ts',
])('%s runtime imports', (entry) => {
  const { files, packages } = closure(entry)

  test('do not reach secp256k1', () => {
    expect([...packages].filter((p) => p.includes('secp256k1'))).toEqual([])
  })

  test('do not reach the private-key account code', () => {
    expect(
      [...files].filter((f) =>
        /accounts\/(privateKeyToAccount|hdKeyToAccount|mnemonicToAccount)\.ts$/.test(
          f,
        ),
      ),
    ).toEqual([])
  })
})

test('the walker sees through to secp256k1 where it is imported', () => {
  // Guards the guard: the same walk from the key-backed account does find it.
  const { packages } = closure('accounts/privateKeyToAccount.ts')
  expect([...packages].some((p) => p.includes('secp256k1'))).toBe(true)
})
