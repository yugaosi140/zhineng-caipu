# 部署：让生产环境也能拿到菜价

开发时菜价接口靠 Vite 的 `server.proxy` 转发。`npm run build` 出来的是纯静态文件，
里面没有 dev server，那层代理就不存在了 —— 直接扔到静态托管上，菜价请求会全部失败，
界面降级到 `baseline` 兜底价（不会白屏，但显示的价格是静态的）。

要在生产拿到指数折算价，需要在托管前面放一层同源反向代理，把 `/pfsc/*` 转到
`https://pfsc.agri.cn/*`。

## 为什么必须是「同源」

浏览器不能直连 `pfsc.agri.cn`，两道坎：

1. 该站不返回 `Access-Control-Allow-Origin`，跨域请求被 CORS 拦掉。
2. 它的 WAF 会校验 `User-Agent` 和 `Referer`，浏览器发出的请求带不上服务端那套头。

所以代理必须由服务端完成，并且对浏览器而言和页面同源。下面每份配置都做了三件事：
改写路径去掉 `/pfsc` 前缀、把 `Host` 改成上游域名、补上 `Referer` 和 `User-Agent`。

## 配置前缀

前缀由构建时环境变量 `VITE_PFSC_BASE` 决定，默认 `/pfsc`。

```bash
cp .env.example .env.production
# 编辑 .env.production，通常保持默认 /pfsc 就行
npm run build
```

只有当你的代理挂在别的路径（比如 `/api/pfsc`）或独立域名（`https://proxy.example.com`）时
才需要改这个值。注意 Vite 的环境变量是构建时内联的，改完要重新 build。

## Nginx

```nginx
server {
  listen 80;
  server_name chushan.example.com;

  root /var/www/chushan;
  index index.html;

  # 单页应用：找不到文件就回 index.html
  location / {
    try_files $uri $uri/ /index.html;
  }

  location /pfsc/ {
    proxy_pass https://pfsc.agri.cn/;

    # WAF 校验这两个头，不带会被拒
    proxy_set_header Host pfsc.agri.cn;
    proxy_set_header Referer https://pfsc.agri.cn/;
    proxy_set_header User-Agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

    proxy_ssl_server_name on;
    proxy_http_version 1.1;

    # 该接口探测频繁时会返回 500，超时给短一点，别让前端干等
    proxy_connect_timeout 5s;
    proxy_read_timeout 12s;

    # 服务端也缓存一层，进一步降低触发上游限流的概率
    proxy_cache_valid 200 1h;
  }
}
```

`proxy_pass` 末尾那个 `/` 是关键，它负责把 `/pfsc/api/x` 变成 `/api/x`。漏掉的话
上游收到的是 `/pfsc/api/x`，一律 404。

## Caddy

```caddyfile
chushan.example.com {
  root * /var/www/chushan
  try_files {path} /index.html
  file_server

  handle_path /pfsc/* {
    reverse_proxy https://pfsc.agri.cn {
      header_up Host pfsc.agri.cn
      header_up Referer https://pfsc.agri.cn/
      header_up User-Agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
  }
}
```

`handle_path`（而不是 `handle`）会自动剥掉 `/pfsc` 前缀。

## Netlify

`netlify.toml` 放仓库根目录：

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/pfsc/*"
  to = "https://pfsc.agri.cn/:splat"
  status = 200          # 200 而不是 301，才是代理而非跳转
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Netlify 的 redirect 代理不能自定义请求头，上游 WAF 可能拒掉。真拒了就退回自建
Nginx/Caddy，或用下面的 Cloudflare Worker。

## Cloudflare Workers

静态托管在 Pages、代理用 Worker 时：

```js
export default {
  async fetch(request) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/pfsc/')) {
      return new Response('Not found', { status: 404 })
    }

    const upstream = new URL(url.pathname.replace(/^\/pfsc/, ''), 'https://pfsc.agri.cn')
    upstream.search = url.search

    const res = await fetch(upstream, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        Referer: 'https://pfsc.agri.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      body: request.method === 'POST' ? await request.text() : undefined,
    })

    // 页面和 Worker 不同源时要放开 CORS
    const headers = new Headers(res.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(res.body, { status: res.status, headers })
  },
}
```

## GitHub Pages

Pages 是纯静态托管，没有反向代理能力，**菜价一定落 baseline**。仓库里的
`.github/workflows/deploy.yml` 就是往 Pages 发的，适合只想让人看看界面和推荐逻辑
的场景。想要真实菜价，得换到上面那些能跑代理的托管。

## 验证代理通了

部署完在浏览器控制台执行：

```js
fetch('/pfsc/price_portal/pi-info-day/getPortalPiInfoDay', { method: 'POST' })
  .then((r) => r.json())
  .then(console.log)
```

返回带 `content` 数组就是通了。界面上菜价来源标签会从「基线估算」变成「指数折算」。
