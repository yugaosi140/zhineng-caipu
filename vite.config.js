import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/pfsc': {
        target: 'https://pfsc.agri.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pfsc/, ''),
      },
    },
  },
})
