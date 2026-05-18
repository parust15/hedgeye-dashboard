import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // React 19's react-hooks plugin flags any setState inside an
      // effect as "cascading renders". The codebase legitimately uses
      // this pattern to reset state when a prop becomes null (e.g.
      // useTickerSummary / useEtfInfo / etc.), so the rule's signal-
      // to-noise is poor. Downgrade to warning so the real errors —
      // ones we'd want to address — aren't drowned by the resets.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
