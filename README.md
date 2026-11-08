# 学科小程序

首期：语文 · 文言文搜索。文档在 `docs/`，先看 `04-上线清单.md`。

| 目录 | 内容 |
|---|---|
| `docs/` | 需求、页面交互、接口与数据、上线清单 |
| `data/` | `文言文字词数据.json` 和生成它的脚本（`tools/`） |
| `cloud/` | 微信云开发后端（备案期间使用），见 `docs/05-云开发方案与迁移.md` |
| `server/` | 自有服务器后端（备案后使用）：Fastify + TypeScript，正式环境用 PostgreSQL，本地用内嵌的 PGlite |
| `miniapp/` | 小程序：uni-app（Vue 3 + TypeScript） |
| `deploy/` | Docker Compose 与 Nginx 配置 |

## 本地运行

```bash
# 1. 接口（首次启动自动导入数据，端口 3000）
cd server && npm install && npm run dev

# 2. 小程序
cd miniapp && npm install && npm run dev:mp-weixin
# 微信开发者工具导入 miniapp/dist/dev/mp-weixin，本地设置里勾选「不校验合法域名」

# 也可以在浏览器里看：npm run dev:h5，打开 http://localhost:5173
```

没有配置 `WX_APPID` / `WX_SECRET` 时，接口处于开发模式：登录不经过微信，直接把 code 当作用户身份。正式环境（`NODE_ENV=production`）缺少这些配置会拒绝启动。

## 测试

```bash
cd server && npm test          # 13 个接口测试
node --test cloud/test/core.test.mjs   # 云函数核心逻辑，在项目根目录执行
cd miniapp && npm run type-check
```
