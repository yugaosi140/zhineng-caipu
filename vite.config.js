import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// GitHub Pages 的项目页挂在 /<仓库名>/ 下，资源用绝对根路径会 404。
// 部署工作流通过 BUILD_BASE 传进来，本地开发保持 '/'。
const base = process.env.BUILD_BASE || '/'

export default defineConfig({
  base,
  plugins: [vue()],
  server: {
    proxy: {
      // 浏览器不能直连 pfsc.agri.cn（CORS + WAF 校验 UA/Referer），
      // 开发环境靠这层转发。生产环境需自建反向代理，见 deploy/README.md。
      '/pfsc': {
        target: 'https://pfsc.agri.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pfsc/, ''),
        headers: {
          Referer: 'https://pfsc.agri.cn/',
        },
      },
    },
  },
})
