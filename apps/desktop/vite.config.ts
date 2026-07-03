import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
// Base relativa para que el renderer cargue correctamente cuando se abre
// desde file:// dentro del proceso de Electron.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        tv: path.resolve(__dirname, 'tv.html'),
        mic: path.resolve(__dirname, 'mic.html'),
      },
    },
  },
})
