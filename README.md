# 📖 听写助手 (Dictation App)

一个支持**英语**和**语文**的听写练习 Web 应用。支持多词库切换、错词本、学习进度统计，可部署到 Vercel + Cloudflare。

## 功能特性

- **双科听写**：英语（显示中文释义）、语文（显示拼音）
- **三引擎 TTS**：API 代理 → edge-tts-universal → Web Speech API 逐级降级，确保语音可用
- **多词库**：内置四级词汇、考研词汇、雅思核心、六年级英语/语文词库
- **用户自定义词库**：批量导入或逐个添加单词
- **错词复习**：自动记录错词，支持单独复习
- **学习统计**：每日正确率、7 天趋势图
- **听写模式**：屏幕显示模式 / 纯听力模式
- **暗色模式**：跟随系统自动切换
- **PWA 支持**：可添加到桌面，离线可用
- **邀请码注册**（可选）：限制注册，防止滥用

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vue 3 (Composition API + `<script setup>`) |
| 构建 | Vite 8 |
| 状态管理 | Pinia |
| 数据库 | Neon PostgreSQL (Serverless) |
| 认证 | Neon Auth (Better Auth) |
| 语音 | Cloudflare Worker TTS 代理 / edge-tts-universal |
| 部署 | Vercel (前端 + API) + Cloudflare Workers (TTS) |
| PWA | vite-plugin-pwa |

## 安装指南

```bash
# 1. 克隆项目
git clone https://github.com/su469843/tintin.git
cd tintin

# 2. 安装依赖
npm install

# 3. 复制环境变量模板
cp .env.example .env

# 4. 启动开发服务器
npm run dev

# 5. 构建生产版本
npm run build
```

## 环境变量配置

复制 `.env.example` 为 `.env`，填入以下变量：

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DATABASE_URL` | 是 | Neon PostgreSQL 连接字符串 |
| `TTS_API_KEY` | 否 | TTS 代理 API 密钥（参见下方 TTS 配置） |
| `BETTER_AUTH_URL` | 是 | 认证服务 URL（部署后设为 Vercel 域名） |
| `BETTER_AUTH_SECRET` | 是 | 认证密钥（任意随机字符串） |

### 数据库配置（Neon PostgreSQL）

1. 注册 [Neon](https://neon.tech)（免费）
2. 创建项目，获取 `DATABASE_URL` 连接字符串
3. 执行 `db/migrate.sql` 创建表结构
4. 在 Vercel Dashboard → Settings → Environment Variables 中添加 `DATABASE_URL`

### TTS 服务配置

TTS 通过自建 Cloudflare Worker 代理调用，避免 CORS 限制。

1. 部署 TTS Worker：[su469843/edge-tts-openai-cf-worker](https://github.com/su469843/edge-tts-openai-cf-worker)
2. 在 Worker 的 Settings → Variables 中添加 `API_KEY`（自定义密钥）
3. 在 Vercel Dashboard → Environment Variables 中添加 `TTS_API_KEY`（与上一步值一致）
4. 不配置 TTS_API_KEY 时，系统自动降级为 edge-tts-universal（浏览器端免费，无需密钥）

## 部署到 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/su469843/tintin)

1. Fork 或 Push 代码到 GitHub
2. 在 [Vercel](https://vercel.com) 导入仓库
3. 添加环境变量（DATABASE_URL、BETTER_AUTH_URL、BETTER_AUTH_SECRET）
4. 部署，Vercel 会自动识别为 Vite 项目

## 使用说明

### 听写
1. 在词库管理选择要练习的词库
2. 在听写标签页点击"朗读"按钮
3. 听到语音后，在输入框中拼写
4. 点击确认，系统自动判断对错

### 词库管理
- **切换词库**：点击词库名称切换
- **导入 JSON**：上传符合格式的 JSON 词库文件
- **批量添加**：`单词, 释义` 每行一条，或 `en, zh` 格式
- **用户自定义**：创建自己的词库并添加单词

### 错词复习
- 答错的单词自动记录到错词本
- 在错词标签页可查看、删除、或开始错词复习

### 听写模式
- **屏幕显示**：显示单词+释义/拼音，看着听写
- **纯听力**：只听音频，不显示文字，全部完成后统一揭晓

## 项目结构

```
tintin/
├── api/                    # Vercel Serverless Functions
│   └── tts.js             # TTS 代理
├── functions/api/          # Cloudflare Pages Functions
│   ├── invitations/        # 邀请码 CRUD
│   ├── stats/              # 学习统计
│   ├── word-banks/         # 用户词库
│   └── wrong-words/        # 错词 CRUD
├── public/                 # 静态资源
│   ├── words.json          # 内置英语词库
│   ├── words-g6.json       # 六年级英语词库
│   ├── words-g6-chinese.json # 六年级语文词库
│   └── manifest.json       # PWA 清单
├── src/
│   ├── components/         # Vue 组件
│   ├── stores/             # Pinia 状态管理
│   ├── composables/        # 组合式函数
│   └── lib/                # 工具库
├── vite-plugins/           # Vite 插件（开发代理）
└── scripts/                # 工具脚本
```

## 许可证

MIT
