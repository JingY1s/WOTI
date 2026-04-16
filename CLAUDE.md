# WOTI — 坦克世界玩家人格测试

> 完整开发历程、问题复盘、决策回顾见 [开发记录.md](./开发记录.md)
> 本文件是给 Claude 的项目快速操作手册

---

## 项目快速档案

- **定位：** 仿 MBTI 风格娱乐人格测试，4 维度（AD/ST/CR/HF）× 16 主类型 + 2 隐藏
- **状态：** v1.1 已上线生产环境
- **生产 URL：** https://11-woti.icu
- **管理面板：** https://11-woti.icu/#admin（密码 `woti2026`）
- **GitHub：** https://github.com/JingY1s/WOTI
- **Supabase：** https://htzavddjrbrdtvrtplqa.supabase.co

## 技术栈

| 层 | 选择 | 备注 |
|---|------|------|
| 前端 | 原生 HTML/CSS/JS | 零依赖、零构建 |
| 后端数据 | Supabase | 4 张表，REST API 直调，无 SDK |
| 部署 | Cloudflare Workers | `[assets]` 模式做静态托管 |
| 域名 | 11-woti.icu | 阿里云购买，DNS 托管在 Cloudflare |

## 目录结构

```
index.html              主页面（首页/答题/结果/分享/管理面板/留言墙）
css/style.css           暖白+军绿浅色主题（15K）
js/app.js               核心逻辑（33K，最大文件，分段读取）
js/supabase.js          Supabase REST 封装（含 URL/anon key）
data/questions.json     兜底题库（Supabase 失败时回退）
data/types.json         兜底类型数据
wrangler.toml           Cloudflare 部署配置（routes 必须在 [assets] 之前）
supabase_setup.sql      数据库建表 SQL（含 RLS 策略）
.assetsignore           排除 .git/.wrangler/wrangler.toml 不上传
```

## 部署操作（每次改代码后）

```bash
# 1. PATH 必须先加 Node.js（终端不会自动识别）
export PATH="/c/Program Files/nodejs:$PATH"

# 2. 设置 Cloudflare 凭据（环境变量，问用户拿 Token 或读本地 .env.local）
export CLOUDFLARE_API_TOKEN="<向用户索要>"
export CLOUDFLARE_ACCOUNT_ID="d0c6be57e544a6c9ae8760716b9089d0"

# 3. 部署
cd C:/Users/zhangjingyi/woti && npx wrangler deploy
```

> ⚠️ **不要用 `npx wrangler login`** — 在 Claude Code 里会报 `spawn UNKNOWN`，必须用上面的 API Token 方式。
> ⚠️ **API Token 绝不能写入任何提交到 GitHub 的文件** — 会被 GitHub Secret Scanning 拦截，且泄露会被滥用。需要时从用户的本地未提交的 `.env.local` 或聊天历史中获取。

## Supabase 凭据

```
SUPABASE_URL: https://htzavddjrbrdtvrtplqa.supabase.co
SUPABASE_ANON_KEY: 见 js/supabase.js 第 9 行（公开安全）
管理面板密码: woti2026（见 supabase.js 第 12 行）
```

调试 Supabase API 时**用 Node.js 的 fetch 调用**，不要用 shell curl（中文 JSON 容易乱码）。

## 数据库表

| 表 | 主键 | 用途 | 当前数据 |
|---|------|------|---------|
| `types` | code | 18 种人格 | 16 标准 + 2 隐藏 |
| `questions` | id | 题库 | 20 题 |
| `dimensions` | key | 4 个维度定义 | AD/ST/CR/HF |
| `wall_messages` | id | 留言墙 | 用户 UGC |

所有表 RLS 已开启但策略对所有人开放（非生产级安全，靠前端密码控制）。

## 关键陷阱（高频踩坑点）

1. **workers.dev 在国内被 DNS 污染** — 必须绑自定义域名访问，开 VPN 也救不了
2. **wrangler.toml 顺序敏感** — `routes` 必须放在 `[assets]` 段**之前**，否则被 TOML 解析进 assets 段
3. **Supabase PATCH 返回 204 时 res.json() 崩溃** — sbFetch 已处理，新增 API 调用要注意
4. **Supabase bulk insert 所有对象 keys 必须一致** — 给可选字段补 null
5. **Cloudflare Pages 已并入 Workers** — 没有独立 Pages 入口，统一用 Workers + `[assets]`

## 开发约定（覆盖全局 CLAUDE.md）

- **Git 提交：** 本项目不使用 tag，按里程碑写有意义的 commit message 即可
- **改代码前：** 先 Read，理解逻辑再 Edit；JS 大文件分段读
- **修改维度数据结构时：** 必须同步更新 4 处：`questions.json` / Supabase `dimensions` 表 / `app.js` 的 `getDims()` / Canvas 分享卡片
- **改 Supabase 表结构：** 在 `supabase_setup.sql` 也同步更新一份，方便重建

## 当前未完成

- [ ] 16 种人格的创意文案（用户负责填）
- [ ] 2 个隐藏类型 E100、DUCK 的设计
- [ ] 后续优化：RLS 改严格鉴权 / Web Analytics / 移动端调优 / 留言点赞

## 协作模式

用户和同事共享密码 `woti2026`，在 #admin 页面在线编辑，类似共享文档实时同步。
