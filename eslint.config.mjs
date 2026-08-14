import tsParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * Flat config. `next lint` was removed in Next 16, so `npm run lint` silently
 * resolved "lint" as a directory and did nothing — which is how two
 * rules-of-hooks violations reached production.
 *
 * rules-of-hooks is an error: a hook after an early return throws
 * "Rendered more hooks than during the previous render" only once the loading
 * branch flips, so it survives a green build and a passing type check.
 */
export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
    },
  },
]
