# 阿瓦隆 DM 助手 · Avalon DM

> 给线下主持人（DM）用的移动端 App：手机传一圈拍照建档，发身份、跑夜晚、管任务、判刺杀。
> 前端部署在 AWS Amplify，Google 登录、玩家、对局与历史记录由 Supabase 提供。

移动端优先的 React 单文件组件，为《The Resistance: Avalon》桌游的主持人设计。

---

## 目录

- [这是什么](#这是什么)
- [文件结构](#文件结构)
- [运行方式](#运行方式)
- [快速上手](#快速上手)
- [流程与界面](#流程与界面)
- [规则实现](#规则实现)
- [数据模型](#数据模型)
- [持久化与隐私](#持久化与隐私)
- [视觉规范](#视觉规范)
- [代码结构](#代码结构)
- [边界情况](#边界情况)
- [实现注记与已知问题](#实现注记与已知问题)
- [已知取舍](#已知取舍)
- [后续计划](#后续计划)
- [相关文件](#相关文件)

---

## 这是什么

线下玩阿瓦隆，主持人的负担几乎全在记忆和口播上。这个 App 把这部分接管过来：

| 痛点 | App 的处理 |
|---|---|
| 记不住谁是谁，尤其是新朋友局 | 开局传一圈拍照，之后所有界面都用真人头像 |
| 洗牌发牌慢，还容易被瞄到 | 手机传一圈，火漆封信，各自拆封看身份 |
| 夜晚口播容易漏、容易念错顺序 | 逐句脚本，每一步显示「此刻该动作的人」的头像，抬头就能核对 |
| 队长、出征人数、连续否决与第四轮双失败牌容易忘 | 每轮由 DM 选择，其他状态由界面直接标出来 |
| 复盘时想不起哪轮谁投了反对 | 逐轮记录，终局回顾 |

**明确不做的事**：不做互联网房间、不要求每位玩家注册（只有 DM 登录）、不替代实体任务牌（成功/失败牌仍用实体牌，App 只收结果）。

---

## 文件结构

```
avalon-dm-app/
├── avalon-dm.jsx           # React 主界面与游戏流程
├── main.jsx                # React 挂载入口
├── index.html              # Vite 入口，含 viewport-fit=cover 与主题色
├── styles.css              # Tailwind 入口 + 深色底
├── auth-gate.jsx           # Supabase Google OAuth 与 session gate
├── supabase-client.js      # Supabase Auth / Data API 适配层
├── supabase/               # 数据库迁移、RLS 与 RPC
├── amplify.yml             # AWS Amplify 构建与安全响应头
├── vite.config.js          # Vite 与 Tailwind
├── .env.example            # Supabase 前端配置示例
├── package.json
├── avalon-dm-spec.md       # 完整设计文档（规则、流程、视觉、边界情况）
├── README.md               # 本文件
├── CLAUDE.md               # AI 协作的操作约定
├── .agent-orchestrator.json
├── .claude/
│   ├── agents/             # 五个子 agent 定义
│   └── skills/
│       └── avalon-frontend-design/   # 前端设计系统
└── .github/                # issue / PR 模板
```

游戏流程仍集中在单一 React 组件中；登录和数据访问拆到 Supabase 适配层。浏览器只持有 publishable key，实际访问范围由登录用户与数据库 RLS 控制。

---

## 运行方式

### 本地开发（推荐）

先复制环境变量并填入 Supabase Project URL 与 publishable key：

```bash
cp .env.example .env.local
npm install
npm run dev
```

打开 http://localhost:5174/。`server.host` 已开启，同一局域网下的手机可以直接访问终端打印的 Network 地址。

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动 Vite（5174） |
| `npm run build` | 产出 `dist/` |
| `npm run preview` | 本地预览构建产物 |
| `npm test` | Vitest（目前还没有测试文件） |

### 依赖

- **React 19**——只用 `useState` / `useEffect` / `useRef`，无第三方状态库
- **Tailwind CSS v4**——经 `@tailwindcss/vite` 引入。布局类名（`flex`、`grid-cols-3`、`rounded-xl`、`active:scale-95` 等）写在 `className` 上；颜色与字体全部走内联 `style`，取自文件顶部的 `C` 调色板。**Tailwind 不是可选项**：`avalon-dm.jsx` 里有 65 处工具类，缺了它布局会塌
- **Vite 8**——构建与开发服务器
- **Supabase JS**——Google OAuth、session 与 Data API
- **Supabase PostgreSQL**——保存玩家、对局角色、组队投票及任务历史；所有业务表开启 RLS
- **AWS Amplify Hosting**——托管生产环境静态前端

### Google 登录

选择「使用 Google 账号登录」后由 Google 完成身份验证，第一次登录会自动建立 DM 账号，无需另设密码。玩家和对局数据按账号隔离，未登录或其他账号无法读取。

启用前需要在 Google Auth Platform 建立 Web OAuth Client，并配置：

- Authorized JavaScript origins：`https://main.dzakt8h8vf2bn.amplifyapp.com`、`http://127.0.0.1:5174`、`http://localhost:5174`
- Authorized redirect URI：`https://ninniidhnnhaoiebuxgf.supabase.co/auth/v1/callback`
- 将 Client ID 与 Client Secret 填入 Supabase Dashboard 的 Authentication → Sign In / Providers → Google；凭证不要放进 Vite 环境变量或仓库

---

## 快速上手

给第一次用的 DM：

1. 打开 App，选人数（5–10）
2. 手机传一圈，每人自拍 + 写名字，传回你手上
3. 勾角色（新手局建议只开**派西维尔 + 莫甘娜**），选「App 发牌」
4. 手机再传一圈，每人按火漆印看自己身份，看完传下一位
5. 收回手机，跳过夜晚，直接开第一轮
6. 之后照着屏幕点：选本轮队长与人数 → 选队友 → DM 判定组队 → 收失败牌录数字
7. 好人三胜时 App 会自动叫刺客出手

全程你只需要记住一件事：**手机传出去之前，先确认屏幕停在封口页。**

---

## 流程与界面

```
入座 → 配角色 → [App 发牌 → 传阅身份] 或 [实体牌 → 夜晚逐角色确认]
     → 夜晚仪式（可跳过） → 任务循环 ×N → 刺杀 → 终局亮牌
```

七个阶段由单一的 `phase` 状态驱动：

| `phase` | 界面 | 做什么 |
|---|---|---|
| `setup` | 入座 | 选人数、传手机拍照填名字；全员填完名字才放行 |
| `roles` | 配置角色 | 四个特殊角色开关、实时牌堆预览、选择发牌方式 |
| `pass` | 传阅身份 | 每人一屏，封口态（火漆印）↔ 拆封态（羊皮纸身份卡） |
| `night` | 夜晚仪式 | 逐句脚本；实体牌模式同时按揭晓顺序点选角色玩家 |
| `game` | 任务循环 | 五步循环：选队长与人数 → 选队友 → DM 判定 → 任务 → 结果 |
| `assassin` | 刺客出手 | 列出所有好人，点谁即指认谁 |
| `end` | 终局 | 胜负与原因、全员亮牌、任务回顾、两个出口 |

### 传阅身份时各角色看到什么

| 角色 | 标题 | 名单 |
|---|---|---|
| 梅林 | 你能看见的邪恶角色 | 仅刺客 + 莫甘娜（如有） |
| 派西维尔 | 这两人之一是梅林 | 梅林 + 莫甘娜，**每次进入重新洗牌** |
| 刺客 | 与你相认的莫甘娜 | 仅莫甘娜（如有） |
| 莫甘娜 | 与你相认的刺客 | 仅刺客 |
| 莫德雷德 / 奥伯伦 / 爪牙 / 忠臣 | — | 空，显示「你今晚看不到任何人」 |

> 派西维尔的名单每次进入都会重新洗牌，避免「第一个总是梅林」被摸出规律。

### 夜晚脚本

由 `buildNight()` 根据实际在场角色动态生成。实体牌模式会先由 DM 逐个确认角色，再只让刺客与莫甘娜相认；随后让梅林仅确认刺客与莫甘娜，最后确认派西维尔并展示梅林与莫甘娜。未启用角色自动跳过。

1. **闭眼**——所有人闭眼，握拳，伸出大拇指
2. **刺客与莫甘娜相认**——只有这两个角色睁眼；没有莫甘娜时自动跳过
3. **梅林确认坏人**——只有刺客与莫甘娜伸拇指，其他邪恶角色保持不动
4. **派西维尔确认**——梅林与莫甘娜伸拇指，派西维尔睁眼（**仅在选了派西维尔时出现**）
5. **天亮**——所有人睁眼

App 发牌模式下，情报已在拆封环节给过，第一屏提供「大家已在手机上看过情报，跳过夜晚」。实体牌模式按完整脚本走。

### 每轮主持流程

游戏页用五个连续环节提示 DM 当下要做什么。每次组队先由 DM 选择队长和出征人数，再选择队友。投票可逐人记录，也可完全跳过，由 DM 直接判定组队通过或失败。

### DM 底牌

除传阅身份阶段（`pass`）外，右上角常驻「按住看底牌」：按住显示全场身份，**松手立即消失**——避免误触后停留在屏幕上被人看到。

---

## 规则实现

以《The Resistance: Avalon》胜负规则为基础，并允许 DM 自定义每轮队长、出征人数与组队判定。

### 阵营人数 `SPLIT`

| 总人数 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|
| 好人 | 3 | 4 | 4 | 5 | 6 | 6 |
| 坏人 | 2 | 2 | 3 | 3 | 3 | 4 |

### 每轮出队人数 `TEAM`

| 总人数 | 第1轮 | 第2轮 | 第3轮 | 第4轮 | 第5轮 |
|---|---|---|---|---|---|
| 5 | 2 | 3 | 2 | 3 | 3 |
| 6 | 2 | 3 | 4 | 3 | 4 |
| 7 | 2 | 3 | 3 | 4 | 4 |
| 8 | 3 | 4 | 4 | 5 | 5 |
| 9 | 3 | 4 | 4 | 5 | 5 |
| 10 | 3 | 4 | 4 | 5 | 5 |

**双失败牌规则** `failsNeeded(n, r)`：7 人及以上时第 4 轮需 **2 张**失败牌才算失败，其余情况 1 张即失败。界面上该轮用 `✦` 标记。

### 角色 `ROLES`

| 键 | 角色 | 阵营 | 能力 |
|---|---|---|---|
| `merlin` | 梅林 | 好 | 仅知晓刺客与莫甘娜 |
| `percival` | 派西维尔 | 好 | 看到梅林与莫甘娜两人，但分不清谁是谁 |
| `servant` | 忠臣 | 好 | 无情报 |
| `assassin` | 刺客 | 坏 | 好人三胜后，由他指认梅林 |
| `morgana` | 莫甘娜 | 坏 | 在派西维尔眼中与梅林无法区分 |
| `mordred` | 莫德雷德 | 坏 | 梅林看不见他 |
| `oberon` | 奥伯伦 | 坏 | 不认识其他坏人，其他坏人也不认识他 |
| `minion` | 爪牙 | 坏 | 无情报，填充剩余坏人位 |

**牌堆生成 `buildRoles(count, opts)`**

- 坏人：刺客必选 → 依次加入勾选的莫甘娜 / 莫德雷德 / 奥伯伦 → 截断到本局坏人位数 → 不足部分用爪牙补齐
- 好人：梅林必选 → 勾选则加入派西维尔 → 剩余全部为忠臣
- 若勾选的特殊坏人超出坏人位数量，界面红字提示「多选的会被忽略」，按上述顺序截断

发牌时对整副牌堆做一次 `shuffle()` 后按下标分配。

### 胜负判定

| 结局 | `winner` | 触发条件 |
|---|---|---|
| 好人获胜 | `good` | 三次任务成功后，刺客指认错误 |
| 坏人获胜 | `evil-assassin` | 三次任务成功后，刺客指中梅林 |
| 坏人获胜 | `evil-mission` | 三次任务失败 |
| 坏人获胜 | `evil-vote` | 连续 5 次组队被否决 |

否决计数在任务执行后清零。每次新组队都由 DM 重新选择队长；组队被否决后回到队长选择，否决数达 5 仍判坏人胜。

---

## 数据模型

```js
Player = {
  id: string,         // 稳定唯一 id
  name: string,
  photo: string|null, // dataURL，260×260 JPEG
  role: string|null,  // ROLES 的键
}

State = {
  phase: 'setup'|'roles'|'pass'|'night'|'game'|'assassin'|'end',
  count: 5..10,
  players: Player[],
  opts: { percival, morgana, mordred, oberon },  // 布尔
  dealMode: 'auto'|'manual',

  passIdx, sealBroken,      // 传阅
  nightStep,                // 夜晚步骤
  peek,                     // 是否正在按住看底牌

  round: 0..4,
  step: 'leader'|'team'|'vote'|'mission'|'missionResult',
  leader: number|null,      // players 下标；每次由 DM 选择
  selectedTeamSize: number, // 本轮由 DM 选择的出征人数
  team: string[],           // player id
  votes: { [id]: true|false|undefined },
  rejects: 0..5,
  history: [{ fails, ok, team, leader }],
  missionResult: { fails, ok }|null,
  gameId: string|null,      // Supabase PostgreSQL games.id
  winner: 'good'|'evil-assassin'|'evil-mission'|'evil-vote'|null,
  killed: Player|null,
}
```

界面中的即时状态仍由组件内 `useState` 管理；关键事件同时写入 Supabase PostgreSQL。

---

## 持久化与隐私

Supabase PostgreSQL 使用以下表：

| 表 | 内容 |
|---|---|
| `players` | 玩家姓名与头像 |
| `roster_snapshots` / `roster_players` | 最近一次座位名单 |
| `games` | 对局模式、角色选项、胜负与时间 |
| `game_players` | 当局座位与秘密身份 |
| `proposals` | 每次组队、队长、可选的逐人投票记录与 DM 判定 |
| `mission_rounds` | 每轮任务成员、失败牌数量与结果 |

页面右上角显示 Supabase 状态：连接中、保存中、已保存或云端离线。云端暂时不可用时不阻断现场游戏，最近名单会回退存入 `window.storage` 或 `localStorage`；身份与完整对局历史不会写进浏览器存储。

照片会在浏览器中裁成 260×260 JPEG data URL，再随玩家资料写入 Supabase。业务表启用 RLS，并以 `auth.uid()` 将资料限制为当前 DM 账号；前端不包含 service-role key。

---

## 视觉规范

主题取自亚瑟王宫廷：烛光下的深靛底色、金箔线条、羊皮纸身份卡。调色板在 `avalon-dm.jsx:4` 的 `C` 对象里。

| 名称 | 色值 | 用途 |
|---|---|---|
| `ink` | `#10101E` | 页面底色 |
| `ink2` | `#171730` | 底栏 |
| `panel` | `#1C1C38` | 卡片、输入框 |
| `line` | `#2E2E52` | 分隔线、未选中描边 |
| `gold` | `#C8A24C` | 主按钮、队长、选中态 |
| `goldDim` | `#8A7038` | 眉标、次级金 |
| `vellum` | `#E9E2D0` | 身份卡纸面 |
| `vellumInk` | `#2A2418` | 身份卡正文 |
| `azure` | `#4C7BD9` | 好人阵营、任务成功、赞成 |
| `crimson` | `#A8323A` | 坏人阵营、任务失败、反对、火漆 |
| `text` | `#E4E2EE` | 正文 |
| `dim` | `#8483A6` | 辅助文字 |

**字体**

- 展示体 `serif`：Georgia / Times New Roman，用于标题、角色名、脚本正文，字距放宽
- 正文：系统默认无衬线
- 数据 `mono`：等宽，用于人数、轮次、失败牌数

**签名元素**：火漆印。拆封这一下把「传手机」从一个尴尬的操作变成一个仪式动作，也是整个 App 唯一一处高饱和红。其余界面保持克制——平面色块、金色发丝线、无渐变。

**交互约定**

- 所有可点元素按下缩放 95%（`active:scale-95`）
- 头像描边颜色即状态：金 = 选中/队长，蓝 = 好人/赞成，红 = 坏人/反对，灰 = 未选
- 触控目标不小于 44pt，头像网格三列
- 未选中的头像 `opacity: 0.55`。再低在昏暗环境里就读不出人脸了
- 输入框聚焦时描边转金——原本 `outline: none` 且没有替代反馈

**版式**

- 整个 App 是一列，最宽 `SHELL_W`（480px），宽屏上居中而不是铺满；超过 520px 时 `styles.css` 里的 `.shell-col` 给这一列描边
- 高度用 `100dvh` 而非 `100vh`，避免移动端浏览器工具栏遮住底栏
- 安全区由 `Shell` 统一处理：头部 `max(24px, env(safe-area-inset-top))`，底栏 `max(16px, env(safe-area-inset-bottom))`
- `Shell` 的 `center` 属性把内容在竖直方向居中，用于内容短于一屏的页面（火漆封信、身份卡、夜晚脚本）。会滚动的页面不要加

---

## 代码结构

`avalon-dm.jsx` 自上而下：

| 行 | 内容 |
|---|---|
| `:4` | `C` — 调色板；`serif` / `mono` 字体常量 |
| `:25` | `SPLIT` / `TEAM` / `failsNeeded()` — 规则表 |
| `:35` | `ROLES` — 角色定义；`sideColor()` / `isEvil()` / `isGood()` |
| `:49` | `buildRoles()` — 牌堆生成；`shuffle()` — Fisher–Yates |
| `:65` | `knownTo()` — 每个角色夜里能看到谁 |
| `:80` | `Avatar` — 头像，支持描边色与暗淡态，无照片时回退名字首字 |
| `:101` | `Btn` — 按钮，`gold` / `ghost` 两种色调 |
| `:124` | `Rule` — 带金色小标签的分隔线 |
| `:135` | `AvalonDM` — 主组件，含全部状态、API 写入与七个阶段的渲染分支 |

主组件内部的关键函数：

- `openCamera(i)` / `onFile(e)` — 调起系统相机并裁剪照片
- `saveRoster(list)` — 同步玩家与最近名单，失败时回退浏览器存储
- `startDeal()` — 洗牌发身份，进入 `pass` 或实体牌夜晚确认
- `startGame()` — 创建数据库对局、进入本轮队长与出征人数选择
- `resetAll()` — 清空所有 role、回到 `setup`
- `continueAfterVote(approved)` — 保存可选投票记录与 DM 判定，处理否决计数
- `continueAfterMission()` — 保存任务结果，判定三胜/三败/进入下一轮
- `doAssassinate(p)` — 判定刺杀结果
- `buildNight()` — 按在场角色动态生成夜晚脚本
- `Shell` — 页面外壳（眉标 / 标题 / 底牌按钮 / 内容 / 底栏 / 底牌浮层）

---

## 边界情况

| 情况 | 处理 |
|---|---|
| 相机权限被拒 | 头像回退为名字首字，不阻断流程 |
| 未填名字 | 底部按钮禁用，文案改为「还有人没填名字」 |
| 中途改人数 | 已填的玩家保留，多出的位补空、少的截断 |
| 特殊坏人勾多了 | 红字提示，按刺客 → 莫甘娜 → 莫德雷德 → 奥伯伦顺序截断 |
| 夜晚确认重复选择玩家 | 已确认其他身份的玩家会置灰；可返回上一步更正 |
| Supabase 不可用 | 顶部显示「云端离线」，现场游戏继续运行，名单回退浏览器存储 |
| 第二局复用名单 | 进入配角色页时清空所有 role，夜晚步骤归零 |

---

## 数据接口

前端通过 `supabase-client.js` 访问 Supabase Data API。名单与开局使用 `sync_roster`、`create_game` 两个数据库 RPC 保证多表写入原子性；提案、任务与结局直接写入启用 RLS 的业务表。

---

## 已知取舍

- **DM 单账号**。玩家不需要账号；主持人登录后可以从不同设备读取自己的数据。
- **不代管任务牌**。成功/失败牌仍用实体牌，App 只录入结果——保留出牌的手感和「谁出的失败牌」的悬念。
- **不做撤销**。误点投票可以重新切换；已提交的任务结果无法回退。真出错了只能靠 DM 口头澄清。
- **照片跟随玩家资料写入 Supabase**。请先取得玩家同意；后续可改为 Storage bucket 以减少数据库列大小。

---

## 后续计划

优先级从高到低：

1. **座位号 / 发言顺序**——头像上标 1–10，配合「从队长左手边开始发言」
2. **历史浏览器**——把已保存的对局、每轮投票与任务结果做成 App 内复盘页面
3. **撤销上一步**——至少覆盖误录任务结果
4. **湖中仙女**——扩展角色，需要额外的验人流程屏
5. **计时器**——组队讨论限时，防止一轮聊二十分钟
6. **本局导出**——终局生成一张可分享的战报图

---

## 相关文件

- [`avalon-dm-spec.md`](./avalon-dm-spec.md) — 完整设计文档，含规则推导与视觉规范的详细说明
- [`avalon-dm.jsx`](./avalon-dm.jsx) — 全部实现
- [`CLAUDE.md`](./CLAUDE.md) — AI 协作的操作约定：谁能改什么、发布前要谁点头
- [`.claude/skills/avalon-frontend-design/SKILL.md`](./.claude/skills/avalon-frontend-design/SKILL.md) — 前端设计系统，改任何界面之前先读这个

版本 v1.0 · 载体：React 单文件组件，移动端优先 · 工程：Vite 8 + React 19 + Tailwind v4
