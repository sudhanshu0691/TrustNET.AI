import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// Use a relative base so built asset paths work inside Chrome extension pages
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'copy-extension-files',
      apply: 'build',
      enforce: 'post',
      generateBundle() {
        try {
          mkdirSync('dist', { recursive: true })
          
          // Copy main extension files
          copyFileSync('manifest.json', 'dist/manifest.json')
          copyFileSync('background.js', 'dist/background.js')
          console.log('✅ Manifest and background.js copied')
          
          // Copy content scripts
          mkdirSync('dist/src/content', { recursive: true })
          copyFileSync('src/content/warning-banner.js', 'dist/src/content/warning-banner.js')
          copyFileSync('src/content/detector.js', 'dist/src/content/detector.js')
          console.log('✅ Content scripts (warning-banner.js, detector.js) copied')
          
          // Copy icons to dist root (not public subfolder)
          try {
            copyFileSync('public/icon16.png', 'dist/icon16.png')
            copyFileSync('public/icon48.png', 'dist/icon48.png')
            copyFileSync('public/icon128.png', 'dist/icon128.png')
            console.log('✅ Icons copied to dist root')
          } catch (e) {
            console.warn('⚠️ Could not copy icons:', e.message)
          }
        } catch (err) {
          console.error('❌ Error copying extension files:', err)
        }
      },
      writeBundle() {
        try {
          // Remove crossorigin attributes from generated HTML for extension compatibility
          const htmlPath = 'dist/index.html'
          let html = readFileSync(htmlPath, 'utf-8')
          html = html.replace(/ crossorigin/g, '')
          writeFileSync(htmlPath, html)
          console.log('✅ Removed crossorigin attributes for extension compatibility')
        } catch (err) {
          console.warn('⚠️ Could not process HTML file:', err.message)
        }
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
})
