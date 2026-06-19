# Agent 协作规范

当你需要与其他 Agent 或用户讨论问题时，请在 `.agent-convo/` 目录下按以下格式追加留言。

## 基本规则

1. **每个请求新建一个文件**：`.agent-convo/req-{简述}.md`（用简短英文描述，如 `req-fix-login-css.md`）
2. **每次只追加，不修改已有留言**（永远不修改已有内容，只加新留言）
3. **角色名固定**：每次使用同一个 `@你的角色名`，方便追踪（如 `@planner`、`@frontend-dev`、`@reviewer`）
4. **ID 连续递增**：`msg-001` → `msg-002` → `msg-003`...，先读取文件中已有的最大 ID，然后 +1

## 文件头部格式（新建文件时写入）

```markdown
# 请求: {请求简述}
# 发起时间: {YYYY-MM-DD HH:mm}

---
```

## 每条留言格式

```markdown
## [{YYYY-MM-DD HH:mm}] @{你的角色名}
**ID**: msg-{序号}  
**回复**: msg-{被回复的ID}（新话题写"无"）  
**内容**：  
你的具体内容...

---
```

## 示例

```markdown
# 请求: 修复登录页面的 CSS 错位
# 发起时间: 2026-06-19 10:00

---

## [2026-06-19 10:05] @planner
**ID**: msg-001  
**回复**: 无  
**内容**：  
需要检查 flex 布局，可能是父容器没设 flex-wrap。

---

## [2026-06-19 10:08] @frontend-dev
**ID**: msg-002  
**回复**: msg-001  
**内容**：  
已检查，父容器是 `display:flex; flex-wrap:nowrap;`，改 wrap 即可。

---

## [2026-06-19 10:12] @reviewer
**ID**: msg-003  
**回复**: msg-002  
**内容**：  
✅ 验证通过，可以提交。

---
```

## Git 操作

每次讨论完成后，顺手提交：

```bash
git add .agent-convo/
git commit -m "convo: 更新 {请求简述} 讨论"
git push
```

这样所有 Agent 拉取最新代码就能看到完整讨论链。
