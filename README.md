# AG集团工作日历

Next.js + Supabase 的员工任务日历后台。当前版本使用 Supabase Auth、Postgres 和 RLS 作为真实数据源。

## 技术选型

- Next.js App Router + TypeScript
- Ant Design：后台组件库，已接入 App Router 样式注册器
- Supabase：Auth、Postgres、RLS
- dayjs：Ant Design 日期组件默认日期对象

## 已实现

- 单页日历工作台
- 月视图任务日历，支持跨日期时间范围展示
- Supabase 登录、任务创建、状态更新和任务指派
- 管理员账号管理弹窗
- 右侧日期任务详情面板
- 任务详情弹窗与状态操作
- Supabase SSR 客户端与 Next 16 `proxy.ts`
- 管理员账号创建/删除 API：`/api/admin/users`
- 初始数据库 schema：`supabase/schema.sql`

## 本地运行

```bash
pnpm dev
```

打开 http://localhost:3000。

登录页是 http://localhost:3000/login。未登录访问首页会自动跳转到登录页，退出登录后也会回到登录页。

## Supabase 配置

复制环境变量示例：

```bash
cp .env.example .env.local
```

填入：

```bash
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_JWKS_URL=
```

然后在 Supabase SQL Editor 执行：

```bash
supabase/schema.sql
```

`SUPABASE_SECRET_KEY` 只用于服务端管理员开户接口，不要暴露到浏览器。`SUPABASE_PUBLISHABLE_KEY` 会传给浏览器端 Supabase client。`SUPABASE_JWKS_URL` 保留给服务端 JWT 校验配置。

## 后续需要确认

- 任务是否需要重复任务、附件和评论。
- 任务指派后是否需要接收人确认，还是管理员直接生效。
- 是否需要周视图、日视图和拖拽改期。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
