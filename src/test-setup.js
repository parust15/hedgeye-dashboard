// Vitest setup — extends `expect` with jest-dom's DOM matchers
// (toBeInTheDocument, toHaveClass, toHaveTextContent, etc.) so
// component tests can assert against rendered output naturally.
// Referenced from vite.config.js → test.setupFiles.
import '@testing-library/jest-dom/vitest'

// RTL's auto-cleanup-after-each-test only runs when vitest's `globals`
// flag is true (because it hooks via the global afterEach). We keep
// globals=false in vite.config so test files import what they need
// explicitly — so wire cleanup ourselves here.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
