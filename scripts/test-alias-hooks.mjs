import { pathToFileURL } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolves the `@/*` path alias for the node test runner.
 *
 * `tsconfig.json` maps `@/*` to the project root, which Next understands but
 * plain node does not. Without this, any test that imports a module using an
 * aliased import fails with ERR_MODULE_NOT_FOUND, which would otherwise push
 * tests towards only covering dependency-free helpers.
 */
const projectRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..')

// Node needs an explicit extension; TypeScript sources omit it.
const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) {
    return nextResolve(specifier, context)
  }

  const base = resolvePath(projectRoot, specifier.slice(2))
  let lastError
  for (const suffix of CANDIDATE_SUFFIXES) {
    try {
      return await nextResolve(pathToFileURL(base + suffix).href, context)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}
