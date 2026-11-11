import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const srcDir = fileURLToPath(new URL('../../src/', import.meta.url))

/** Build output directories under `src/`; not source. */
const artefacts = new Set(['_cjs', '_esm', '_types'])

/** A direct construction of the base class. */
const bareBaseError = /\bnew\s+BaseError\s*\(/

/** Every `.ts` source file under `dir`, as src-relative paths. */
function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!artefacts.has(entry.name)) found.push(...sourceFiles(path))
    } else if (entry.name.endsWith('.ts')) found.push(relative(srcDir, path))
  }
  return found
}

/** `file:line` of every line of `files` that constructs a bare `BaseError`. */
function bareSites(files: string[]): string[] {
  const sites: string[] = []
  for (const file of files)
    readFileSync(join(srcDir, file), 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (bareBaseError.test(line)) sites.push(`${file}:${index + 1}`)
      })
  return sites
}

// Errors thrown outside `src/errors` are named classes (`InvalidParameterError`,
// `MissingFieldError`, …) so callers can branch on `instanceof`, `name` and the
// structured fields. `BaseError` itself is constructed only by the classes in
// `src/errors` that extend it.
test('no source file outside src/errors constructs a bare BaseError', () => {
  const files = sourceFiles(srcDir).filter((file) => !/^errors[\\/]/.test(file))
  expect(bareSites(files)).toEqual([])
})

test('the scan covers the source tree and recognises a bare construction', () => {
  // Guards the guard: the walk reaches nested source files and skips the
  // error classes' own directory only by the filter above.
  const files = sourceFiles(srcDir)
  expect(files).toContain(join('utils', 'transaction', 'int64.ts'))
  expect(files).toContain(join('errors', 'base.ts'))
  expect(files.some((file) => /^_(cjs|esm|types)[\\/]/.test(file))).toBe(false)

  expect(bareBaseError.test("throw new BaseError('x')")).toBe(true)
  expect(bareBaseError.test('throw new BaseError(\n')).toBe(true)
  expect(bareBaseError.test("throw new InvalidParameterError('x', {})")).toBe(
    false,
  )
  expect(bareBaseError.test('class X extends BaseError {')).toBe(false)
})
