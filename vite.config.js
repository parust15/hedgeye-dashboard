/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    // Extends Vitest's `expect` with jest-dom's DOM matchers so
    // component tests can call .toBeInTheDocument() etc.
    setupFiles: ['./src/test-setup.js'],
  },
})
