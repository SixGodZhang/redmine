# Studio 前端

Redmine 的现代 React 工作台（Vite + TypeScript + Tailwind）。

## 开发

1. 启动 Redmine（默认 `http://127.0.0.1:3000`）
2. 在本目录执行：

```bash
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:5173/app/`。

Vite 会将 `/studio`、`/issues.json` 等 API 请求代理到 Redmine。

## 生产构建

```bash
npm run build
```

产物输出到 `public/app/`，由 Rails 路由 `/app` 提供 SPA。
