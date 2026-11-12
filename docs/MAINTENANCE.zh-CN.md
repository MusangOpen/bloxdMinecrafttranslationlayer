# BloxdTranslationLayer 中文维护文档

本文面向需要改协议、改映射、改资源包或更新固定版本的人。日常使用请看
[使用教程](USAGE.zh-CN.md)。

维护前先记住三条硬规则：

1. 目标版本只允许写在 `bloxd/protocol/target.js`，不要在其它的产品模块里硬编码
   版本字面量。
2. 未知、未映射、校验失败一律 fail closed，不要为了“先跑起来”加静默兜底。
3. 测试失败就是失败。不要跳过、隐藏或用注释掉断言的方式变绿。

## 1. 架构与数据流

### 1.1 入站：Bloxd 到 Minecraft

```
Bloxd Colyseus room
  -> bloxd/client.js        按 856 descriptor 解码、维护协议计数器
  -> bloxd/handlers/*       把 Bloxd 数据翻译成旧版 Minecraft 语义
  -> mc/client.js           LegacyClient 把旧语义映射成 1.21.11 数据包
  -> Minecraft 客户端
```

- `bloxd/client.js` 通过 `room.onMessage('*')` 收取原始包，用
  `bloxd/protocol/live.js` 的 `INBOUND_BY_ID`、`INBOUND_SCHEMAS` 和字段映射
  解码。未知 ID 触发 `E_PROTOCOL_UNKNOWN_INBOUND`，被 ledger 标记为不支持的
  ID 触发 `E_PROTOCOL_UNSUPPORTED_INBOUND`，解码失败触发 `decode-error`。
  这些都会计数，不会静默吞掉。
- 设置包由 `PROTOCOL_SETTINGS` 描述，856 的设置 id 为 `59`，wire 字段为
  `tFF`/`IFF`/`qFF`/`pFF`/`DFF`/`fFF`。畸形设置会走 `settingsInvalid`，不会猜测。
  入服包 id 为 `64`（wire `aE`/`qE`），keepalive 是 `25`，analytics ping 是 `26`、
  update 是 `17`。
- `bloxd/handlers/init.js` 汇总 7 个 handler 模块：`entity`、`world`、`misc`、
  `tablist`、`gui`、`scoreboard`、`anticheat`。
- `mc/client.js` 的 `write(name, data)` 维护旧版包名到 1.21.11 包的显式映射，
  例如 `map_chunk`、`block_change`、`title`、`update_sign`、`player_info`。
  未列出的名字会抛 `E_UNHANDLED_LEGACY_PACKET` 并记录到 `writeErrors`。

### 1.2 出站：Minecraft 到 Bloxd

```
Minecraft 客户端
  -> mc/client.js  _bindInbound()   把 1.21.11 输入事件转成旧版事件名
  -> bloxd/handlers/*              构造旧版 `CPacket*` 载荷
  -> bloxd/client.js               encodeOutbound / normalizeOutbound
  -> Bloxd Colyseus room
```

`mc/client.js` 只做事件归一化，例如 `position`、`look`、`held_item_slot`、
`chat_message`、`chat_command`、`use_item`。`chat_command` 会把命令补成
`/play ...` 的形式再交给聊天处理器。`use_item` 会被转换成带 `direction: -1`、
`x/y/z: NaN` 的哨兵 `block_place`，表示“使用物品”，不是真实放置方块。

### 1.3 连接门禁

`index.js` 收到 `playerJoin` 后：

1. 检查是否已有连接或待加入的 gate，有则拒绝。
2. 检查用户名和 UUID。
3. 检查协议号必须为 `774`。
4. 创建 `LegacyClient`，参数为 `deferInitialPosition: true` 和
   `gateSession: true`。门禁未通过前，除 `login` 外的写包都会抛
   `E_SESSION_NOT_READY`。
5. 创建 `JoinGate`。gate 的 `start()` 发送一次 play login 和一次
   `forced` 的 `add_resource_pack`，然后等待 `resource_pack_receive`。
6. 只有收到 `SUCCESSFULLY_LOADED`（result 0）后，才调用 `openSession()`、
   `sendInitialPosition()`、`onWorldReady()`（触发 `handlers.minecraft`）和
   `connect()`（排队并连接 Bloxd）。
7. `connect()` 用 `socialRequest('bloxd-matchmake', ...)` 取房间信息，再创建
   `BloxClient`。`SPacketJoinGame` 到达后调用 `handlers.bloxd` 和
   `emitInitialSettings()`。

856 的 matchmake 响应用 `gameServerHost`（不是旧版的 `ip`）。`index.js` 与
`BloxClient` 都会在缺失时 fail closed：日志打印响应键名，Minecraft 端收到明确的
「no game server host」原因，不会出现 `wss://undefined`。

入房 payload 必须包含 `isUsingCustomGameTexturePack`（普通游戏为 `null`）、
`playSessionId`（按 gameName 复用，5 分钟窗口）和 `visitSessionId`（进程级复用）。
两个 id 都是 21 位 `[A-Za-z0-9_-]`，由 `bloxd/types/session_ids.js` 生成；不要改成
固定值或省略，服务端 onJoin 会按 856 客户端字段校验。

`JoinAdmission` 只允许一个活跃 gate，避免两个客户端同时完成资源包加载。gate 的
终态是 `connected`、`failed` 或 `closed`，失败时统一结束连接并清理。

## 2. 目录与模块

| 路径 | 作用 |
| --- | --- |
| `index.js` | 启动顺序、资源包预检、Minecraft 服务端、单客户端门禁、排队连接、信号与关闭 |
| `bloxd/protocol/target.js` | 唯一的 856 目标描述：构建名、版本、主包哈希、传输参数 |
| `bloxd/protocol/live.js` | 从固定构建证据派生的 856 协议描述：入站/出站 ID、schema、ledger、设置包、编解码 |
| `bloxd/client.js` | Colyseus 连接、协议计数、编解码、设置应用、入站事件分发 |
| `bloxd/handlers/` | `init.js` 与 7 个 `impl/*` 处理器，负责语义翻译 |
| `bloxd/types/registry-856.json` | 从固定构建生成的方块/物品注册表，含 `numericIdView` 与 `nameView` |
| `bloxd/types/*.js` | 静态表：物品、实体、GUI、效果、颜色、附魔、配方、踢出原因、皮肤、浏览器信息、反作弊常量 |
| `bloxd/party.js`、`bloxd/friends.js` | 组队与好友辅助逻辑 |
| `bloxd/utils.js` | 物品 displayName/lore/itemModel 等结构化身份处理 |
| `mc/client.js` | 1.21.11 适配器，旧版语义到现代数据包的双向转换，写入错误记录 |
| `mc/registry.js` | 1.8 数字 ID 到 1.21.11 注册名的显式别名/变体映射，未知即失败 |
| `mc/components.js` | 旧版 JSON 文本组件到 1.21.11 匿名 NBT 组件的全量转换 |
| `mc/item_models.js` | 带冲突检查的 `item_model` 解析 |
| `mc/join-gate.js` | 登录/资源包/世界门禁状态机与单连接准入 |
| `bloxd/resource_pack/generate.js` | 确定性资源包生成器 |
| `bloxd/resource_pack/server.js` | 仅回环的资源包 HTTP 服务，逐字节提供 ZIP |
| `bloxd/resource_pack/bloxd-856.zip` | 生成产物，提交在仓库内 |
| `bloxd/resource_pack/manifest.json` | 生成产物，记录来源、条目哈希、CRC 和计数 |
| `test/` | 测试套件、夹具、证据索引和审计脚本 |
| `.research/` | 固定构建文件、生成证据、历史基线、一次性分析脚本 |
| `.omo/` | 计划、证据、notepad 等工作区状态 |
| `game/`、`reference/physics/` | 历史参考文件：旧 chunk 与 Java 片段，不是产品代码，不要据此推断当前行为 |
| `docs/` | 本中文文档目录。新增顶层目录时要同步 `test/final-audit.js` 的白名单 |

## 3. 更新固定的 856 目标

当前固定点为 `7rp1w` / `57cd8edd` / 协议 `856`，主包 SHA-256 为
`5b55225a3b3758475fb4a6538ba3170c05a26394fcd878deacf649ecc94dd205`，
资源包为 `bloxd-856.zip`。

完整的迁移步骤、验收门槛和失败恢复写在
[MIGRATION.zh-CN.md](MIGRATION.zh-CN.md)。本章只保留不随版本变化的原则：

1. **只改 `bloxd/protocol/target.js`**
   更新 `build`、`buildVersion`、`version`、`sourceUrl`、`mainBundle` 和
   `generatedManifestSha256`。传输参数由 `version` 派生，例如
   `sendKey = 11 * VERSION + 7`（856 时为 9423，`expKey` 为 42）。不要在
   `bloxd/client.js`、`mc/*` 或 `bloxd/types/browser_info.js` 里另写字面量。
2. **证据只增不改**
   新构建放进 `.research/builds/<build>-<buildVersion>/` 并附带可复核 manifest；
   旧构建、旧注册表、旧资源包和旧提取器都保留为历史基线。
   `.research/historical-before.sha256` 只用于审计旧文件未被改写，不要为了新构建改它。
3. **派生产物必须可复现**
   `live.js`、`registry-<version>.json`、资源包和传输向量都由冻结证据加脚本生成；
   入站与出站 ID 必须 100% 有处置（implemented、ignored、unsupported 之一）。
4. **验收以套件为准**
   `npm run test:required` 的 22 个套件全绿才算完成；历史 `protocol-846` 只作证据，
   不进入绿色路径。

## 4. 协议与映射维护

### 4.1 入站/出站 ledger

`bloxd/protocol/live.js` 里的 `PROTOCOL_LEDGER` 记录每个 ID 的方向和处置。
新增或修改包时：

- 新 ID 必须有明确处置，不能留空。
- 未知 ID 保持 fail closed。不要加“默认当空包”的分支。
- `decodeInbound` / `encodeOutbound` 缺少 codec 时必须抛错，而不是返回原始
  buffer。
- 修改 handler 的读写之后，同步更新
  `test/fixtures/846/handler-vocabulary.json`，然后单独跑：
  ```bash
  node test/mc-adapter.js --only vocabulary
  ```
  该用例要求 `mapped === handlerWrites`、`unhandled === 0`、
  `swallowedWriteErrors === 0`，并且所有 no-op 都列在 ledger 里。

### 4.2 设置包 4

`bloxd/client.js` 依赖 `PROTOCOL_SETTINGS`。证据来源写在
`SETTINGS_EVIDENCE_ID` 附近（856 的设置 id 为 `59`）。wire 字段为
`tFF`/`IFF`/`qFF`/`pFF`/`DFF`/`fFF`。设置解析失败必须落到
`settingsInvalid`，不能猜测字段含义。真实 856 的 keepalive 是 25，
analytics ping 是 26、update 是 17；旧文档里的 117 设置包和 122 伤害映射都已过期，
不要改回去。

### 4.3 注册表别名

handler 内部仍然使用 1.8 的数字 ID 和名字。转换统一走 `mc/registry.js`：

- 用显式别名/变体表把旧名字解析到 1.21.11 注册名。
- 未知名字、未知 ID、未知 metadata 返回类型化失败，不会静默变成石头或盔甲架。
- 不要新增 registry ID，也不要修改 `bloxd/types/registry-856.json` 的内容去
  迎合代码。注册表是生成产物，只能来自固定构建。

 代理：`$(room.state).entities.onAdd(...)`、
`$(ent).listen(field, cb)`。不要再写 schema 2 的 `entities.onAdd` /
`ent.listen`；schema 5 已移除这些方法。`bloxd/client.js` 在房间就绪后提供
`client.stateCallbacks`，handler 统一从它取代理。

状态回调里写 Minecraft 包前必须检查 `client && !client.ended`：玩家断开后
Bloxd 仍可能推送 patch，未加保护的写入会让整个进程崩溃。

### 4.4 Colyseus 状态 schema

Bloxd 的服务器房间状态使用 `@colyseus/schema` 5.x（握手里的 `ReflectionField`
含 `childPrimitive` / `quantized`）。3.x 客户端会报 `field not defined` /
`refId not found`，并在 websocket 回调里抛异常。固定组合是 `colyseus.js`
`0.16.22` 加 `package.json` 的 `overrides` 强制 `@colyseus/schema` `5.0.45`。

实体、掉落物、tickCounter 来自房间状态，不再只看二进制包。集合回调必须走
`getStateCallbacks(room)` 返回的 `$` 代理：`$(room.state).entities.onAdd(...)`、
`$(ent).listen(field, cb)`。不要再写 schema 2 的 `entities.onAdd` /
`ent.listen`；schema 5 已移除这些方法。`bloxd/client.js` 在房间就绪后提供
`client.stateCallbacks`，handler 统一从它取代理。

状态回调里写 Minecraft 包前必须检查 `client && !client.ended`：玩家断开后
Bloxd 仍可能推送 patch，未加保护的写入会让整个进程崩溃。

### 4.5 标题与文本组件

`bloxd/handlers/impl/misc.js` 的约定：

- `middleTextUpper` 映射到主标题，先发 `action: 4` 清空，再发 `action: 2`
  设置时间（`stay: 2147483647`），最后发 `action: 0` 带文本。
- `middleTextLower` 映射到副标题，发 `action: 1`。空字符串也要发，用于清除
  旧副标题。
- 旧版 JSON 组件到 NBT 的转换在 `mc/components.js`。`extra`、`translate`、
  `with`、样式和事件都要保留，不能只取 `text`。
- 物品名称、lore、`custom_name` 的 NBT 处理在 `mc/registry.js` 与
  `mc/components.js`。遇到循环、超深嵌套、超长字符串时降级为纯文本，不能抛错
  打断连接。
- 修改标题或组件后跑：
  ```bash
  node test/mc-adapter.js --only titles
  node test/mc-adapter.js --only components
  ```

### 4.6 1.21.11 世界数据要求

- 进 play 后必须发 update_view_position（客户端用它确定渲染中心；旧版叫
  set_center_chunk）。mc/client.js 的 _position() 在每次服务端位置包之后同步
  chunkX/chunkZ，sendInitialPosition() 初始顺序是 position、spawn_position、
  update_view_position。缺 update_view_position 时客户端会一直停在 Loading
  terrain：日志里会出现大量 `Ignoring chunk since it's not in the view range`，
  区块在解析前就被丢弃。
- 关闭 “Loading terrain” 界面还依赖 `game_state_change` 的 reason 13
  （`level_chunks_load_start`）：客户端收到它之后才开始等自己的区块，并在该区块
  到达后关闭界面。Bloxd 侧不会发这个 MC 包，必须由 `sendInitialPosition()` 在
  登录后合成，且要早于第一个区块包；只发区块不发 reason 13 时，地形已经在渲染
  但界面会一直停住。
- 服务器下发 `SPacketPlayerTeleport` 时必须同时把 `local.pos` 更新成目标坐标，并保持
  `spawned = true`。只发 `position` 而不更新 `local.pos` 时，随后的
  `SPacketViewAngles` 会用旧坐标再发一个 `position`，把客户端拽回传送前的位置
  （玩家不移动时客户端不会回传新坐标，所以永远回不去）。传送后、客户端确认新坐标之前，
  MC 的 `position` 和 `position_look` 都必须先过 teleport 守卫：旧坐标的回传要被丢弃，
  否则它会覆盖 `local.pos`，下一次 `world.update()` 按旧坐标把新位置的区块判为范围外并
  `chunk.delete(true)`，表现为“tp 后地形一片空白”。守卫必须由客户端回传的匹配坐标清除，
  不能用我们自己的 `local.pos` 判距离；1 秒仍未确认时自动放行，避免一直不发移动包。
  另外 `mc/client.js` 在客户端 700ms 内没有回 `teleport_confirm` 时会重发一次 `position`
  并重发 `update_view_position`，`entity.js` 同一时刻会重新 `world.update()` 请求区块——
  防止传送包丢失后客户端停在虚空里一直下坠。
- Bloxd 的传送 Y 是**绝对 Y**（不是本地 Y）。实测：进大厅 `id=2` 是 `1617`（第 6 层），
  进竞技场 `id=4/5` 是 `72/67`（第 0 层），探针里所有玩家实体在同一秒从 `y≈1617`
  跳到 `y≈59`。所以客户端位置和 `world.update()` 的区块请求都必须直接用 `data.y`：
  按“本地 Y + 楼层偏移”处理会把竞技场请求成 `chunkY≈49`（第 6 层），区块永远不来，
  客户端就在虚空里一直下坠。`yOffset` 只在 `data.y > 255` 时按 255 取整，用于跨层清理
  区块。
- 实体坐标在 `bloxd/handlers/impl/entity.js` 内部统一是“方块 ×32”（`entity.pos`），
  因此 `spawn_entity` / `entity_teleport` 发包前必须 `/32`；`world.isEntityLoaded`
  也是按这个约定做两次除法。少除一次会把实体放到 32 倍远的位置（客户端日志里能看到
  实体坐标是玩家的 32 倍，实体因此永远不进视野）。每个实体还必须用互不相同的
  UUID，`mc/client.js` 按实体 id 生成稳定的唯一 UUID。
- 区块编码统一由 mc/chunk.js 负责，不再依赖 prismarine-chunk（该库把
  1.21 映射到它自己的 1.18 实现）。1.21.11 的 chunkData 是 24 段，每段
  `i16 blockCount + 方块调色板 + 生物群系调色板`，无 fluid count、无长度前缀；
  调色板位宽 0 表示单值，1..8 为间接调色板，超过 8 为全局 id，long 数量按
  `ceil(cells / floor(64 / 位宽))` 计算，值不跨 long。
- 高度图必须发三种：world_surface、motion_blocking_no_leaves、
  motion_blocking，各 37 个 long。格式是 vanilla SimpleBitStorage：每个 long
  放 7 个 9-bit 值、不跨 long；存值是 `最高匹配 y + 1 - (-64)`，无匹配为 0。
  按连续位流算出的 36 个 long 会被客户端判定为长度不符并丢弃高度图。
- 天空光保持全亮：y=0..319 对应的 20 个 light section 全部置位并附 2048
  字节 0xff；block light 全空。光照掩码容量 26 位，y=0 对应 bit 5。
- 客户端只接受渲染中心 ±viewDistance 内的区块（login 里声明 8）。中心尚未
  更新或区块超出范围时，mc/client.js 会暂存并在中心变化后重发，避免区块被
  丢弃后再也不发。
- map_chunk 的 sky/block light mask 与数组数量必须对应：skyLightMask 里的每个
  置位都要有 2048 字节数据，emptyBlockLightMask 全置位时不能附带 blockLight。

## 5. 资源包维护

### 5.1 输入与输出

`bloxd/resource_pack/generate.js` 只读固定构建证据：

- `.research/7rp1w-audit/generated/assets.json`
- `bloxd/types/registry-856.json`
- `.research/builds/7rp1w-57cd8edd/main.js` 与其 28 个固定 PNG chunk
  （`.research/builds/7rp1w-57cd8edd/chunks/`）

输出：

- `bloxd/resource_pack/bloxd-856.zip`
- `bloxd/resource_pack/manifest.json`

生成器会校验输入 assets/registry 的 SHA-256、chunk 哈希、构建名、构建版本、
Bloxd 版本（856）和 `sourceMainSha256`。任何一项过期都直接失败。

### 5.2 真实纹理与占位符

- 真实纹理来自固定 chunk 内嵌的 PNG 模块（`pinned-856-chunk-base64`）。这是真实
  图像字节，不是按名字生成的色块。
- 只有两类纹理会使用 `missing-evidence-placeholder`：`caught_` 前缀且当前证据里
  没有 PNG 模块的纹理，以及生成器 `MISSING_EVIDENCE_TEXTURES` 里逐条登记、并在
  `manifest.json` 的 `pack.textureProvenance.explicitMissingEvidence` 中带原因输出的
  856 显式例外（当前只有映射块指向的模块在固定构建里不存在时才会出现）。它是显式的
  16x16 品红/深灰棋盘格，永远不会被描述成真实纹理。
- 数量不要写死在代码或文档里，以 `manifest.json` 的
  `pack.textureProvenance` 和 `counts` 为准。当前生成结果的字段包括
  `realTextures`、`placeholderTextures`、`missingEvidenceTextures`、
  `explicitMissingEvidence`。
- 如果某个必需纹理既不在 chunk 里、也不符合占位符条件，生成器抛
  `E_MISSING_ASSET`。不要为了通过而放宽这个检查。

### 5.3 确定性 ZIP

`buildZip()` 的行为是契约的一部分：

- 条目按路径排序。
- 固定 DOS 时间 `00:00:00` 和日期 `1980-01-01`。
- 固定 Unix 权限 `0644`，不做符号链接。
- deflate level 9、固定 memLevel 和策略。
- UTF-8 文件名，不使用 extra 字段或注释。

同样的输入必须得到同样的 ZIP 字节和 SHA-256。修改生成逻辑后，先本地生成两次
比较哈希，再跑 `node test/resource-pack.js --all`。

### 5.4 服务端

`bloxd/resource_pack/server.js` 在构造时读取 ZIP 和 manifest 一次，计算 SHA-1，
并派生 UUID 与内容 URL。它只绑定 `127.0.0.1`，拒绝非回环 Host，GET/HEAD 返回
`application/zip` 和精确的 `Content-Length`。ZIP 签名、EOCD、条目 CRC、大小和
哈希都会在启动前校验。服务端不会重新压缩，也不会改写字节。

### 5.5 禁止事项

- 不要新增或注册物品/方块 ID。
- 不要生成 `assets/minecraft/` 下的覆盖文件。生成器遇到会抛
  `E_MINECRAFT_OVERRIDE`，`test/final-audit.js` 也会单独审计。
- 不要加入 placed-block 视觉。放置方块仍然使用现有方块状态映射。
- 不要用旧 840 数据或原版图像数据填充缺失纹理。

重新生成命令：

```bash
node bloxd/resource_pack/generate.js --out bloxd/resource_pack
```

## 6. 测试与证据

### 6.1 权威门禁

`npm run test:required` 是权威的 22 套件离线门禁，顺序由
`test/required-suites.json` 定义：

1. `capture-manifest`
2. `extract-846`
3. `harness-self-test`
4. `required-suite-self-test`
5. `version-pins`
6. `docs-audit`
7. `protocol-856`
8. `transport`
9. `e2e-mc`
10. `e2e-packets`
11. `handlers-smoke`
12. `mc-adapter --only item-components`
13. `mc-adapter --only inbound`
14. `mc-adapter --only components`
15. `mc-adapter --only titles`
16. `mc-adapter --only registry-map`
17. `mc-adapter --only item-visuals`
18. `mc-adapter --only vocabulary`
19. `resource-pack --all`
20. `resource-pack-protocol`
21. `integration-1.21.11 --all`
22. `final-audit`

任何套件失败、超时、输出缺少必需字段，都会让门禁失败。不要用 `SKIP` 标记或
删除证据来绕过。

### 6.2 快速套件与已知 RED

`npm test` 只跑 4 个原有套件：`transport`、`e2e-mc`、`e2e-packets`、
`handlers-smoke`。它不能替代 required suite。

`npm run test:codec` 是旧 840 的随机化 schema 测试，当前已知 RED。它被有意
保留作历史参考，不计入 856 绿色套件。不要把它改成“绿”，也不要让它进入
required suite。历史 846 兼容测试 `protocol-846` 同样保留但排除在绿色路径之外。

### 6.3 审计脚本

```bash
node test/docs-audit.js
node test/final-audit.js
```

- `docs-audit` 读取 `README.md`、两篇中文文档、`target.js`、`package.json` 和锁文件，
  检查版本、Node 版本、四个精确 pin、资源包范围、live/Fabric 状态、启动顺序、命令
  是否可执行、引用文件是否存在，以及是否出现错误声明。它会拒绝 840/846 的过期目标
  声明，并要求 856 目标事实存在。它还会验证 5 个自测注入必须被拒绝。
- `final-audit` 检查历史文件哈希、856 构建 manifest（
  `.research/builds/7rp1w-57cd8edd`）、856 registry、856 资源包哈希、Git 目录、
  Fabric/Java/Gradle 文件、依赖、注册表 ID、`assets/minecraft` 覆盖、
  placed-block 行为、顶层目录白名单和改动范围。正常模式必须 `ok` 且
  `scopeFilesOnly=1`。
- 新增顶层目录或文件时，同步更新 `test/final-audit.js` 的
  `ALLOWED_TOP_LEVEL_DIRECTORIES` / `ALLOWED_TOP_LEVEL_FILES`，以及两处
  `buildScopedDirectories` 输出。否则会报 `E_SCOPE_FILES`。

### 6.4 失败路径自测

```bash
node test/harness-self-test.js
node test/required-suite.js --self-test
node test/docs-audit.js --self-test all
node test/final-audit.js --self-test
```

这些命令的正常成功形态是“注入故障被检测到”。如果注入后仍然退出 0，说明审计
失效，必须修。

### 6.5 证据位置

证据统一放在 `.omo/evidence/update-bloxd-mc-1-21-11-fabric/`：

- `task-N.json` / `task-N.log`：各任务结果。
- `required/`：22 套件的日志、JSON 和 `evidence-index.json`。
- `live-bloxd.json` / `live-bloxd.log`：live Bloxd 状态，当前 BLOCKED。
- `fabric-ui.json` / `fabric-ui.log`：真实 Fabric UI 状态，当前
  BLOCKED_UNVERIFIED。
- `task-23-pack-transcript.json`：资源包/标题相关的集成记录。

审计脚本可以重写自己负责的证据文件（例如 `final-audit --evidence`），但不要
手改历史证据来让审计通过。

## 7. 发布与变更检查清单

按顺序执行：

1. `npm ci`，确认锁文件与 `package.json` 一致。
2. `npm run test:required`，22 套件全绿。
3. `node test/integration-1.21.11.js --all`，确认本地协议集成通过。
4. `node test/docs-audit.js`，确认文档没有过期或虚假声明。
5. `node test/final-audit.js`，确认 `scopeFilesOnly=1` 且没有新增 ID、依赖或
   Fabric 文件。
6. 核对资源包：`manifest.json` 的 `zipSha256` 与真实 ZIP 哈希一致，所有
   manifest/model/texture 引用闭合。
7. 如改了版本或能力，更新 `README.md`、本目录两篇中文文档和对应证据。
8. 本项目不使用 Git。不要执行 `git init`、提交或推送；`final-audit` 会检查
   `.git` 目录和脚本里的变更型 git 命令。

## 8. 已知限制

- live Bloxd 当前 BLOCKED。没有获得授权的真实登录与真实对局验证；之前的
  数据中心 IP 被 Bloxd 以规避封禁为由拒绝。离线协议测试不能证明线上可用。
- 真实 Fabric UI、资源包下载和渲染是 BLOCKED_UNVERIFIED。headless 测试只证明
  数据包路径，不证明真实客户端行为。
- Bloxd 粒子发射器用原版粒子近似，不是逐粒子还原。
- 移动载荷包含新的物理字段，但使用保守默认值，服务端反作弊可能需要调参
  （`gD`/`Mi`/`hiq`/`Si`/`kE`）。
- 告示牌更新通过 `update_sign` 转成 `tile_entity_data`（action 8）并携带
  前后面 NBT，但真实客户端渲染未验证。
- 少量 `caught_` 纹理在当前证据里没有 PNG 模块，使用显式占位符。具体数量以
  `manifest.json` 为准，不要照抄旧数字。
- 旧 557 时代的 `CPacketConstantDetection*` 探针不再发送，856 客户端已不使用。
- 旧版的 `${ip}/persisted/keep-alive` 与 `${ip}/images/Diorite.png` 社交 HTTP 请求在
  856 客户端里已不存在（856 构建中没有这两个端点），因此本项目不再发送，最多只是
  `social/undefined/...` 的 404 噪音。tablist 延迟保持默认 `0`，不再用失败的 HTTP
  往返时间伪造 ping。`BloxClient.ip` 现在存的是 matchmake 返回的原始
  `gameServerHost`，只用于派对位置比较，不是社交分片号。
- 资源包纹理由固定证据确定性派生或提取，这证明包完整性，不等于客户端渲染
  正确。
- 物品表里映射到 `blockId: 0`（minecraft-data 的 air）是合法结果，表示该物品在
  1.21.11 没有对应外观，例如 Bloxd 的 `Spawn Block (White)` 等 16 色标记块。不要把
  `0` 当成「未解析」：曾经的真值判断会因此抛错并崩掉进程。真正未知的物品名依然让
  `translateItem()` 抛 `E_UNRESOLVED_ITEM_NAME` 保持 fail closed；渲染层统一走
  `translateItemSafe()`，把未知物品降级为空物品并按名字只告警一次，避免在 Colyseus
  状态回调里杀死进程。
- `SPacketPlaySound` 的 `cannonFire` 前缀映射到 `random.explode`；每个 case 都必须
  显式 `break`，否则会落到 `dig.<name>` 分支发出不存在的音效名。
- `bloxd/dns_override.js` 只在系统解析把 `game-server-*.bloxd.io` 解析到
  `198.18.0.0/15`（Clash/TUN 的 fake-ip）时，改用 DoH 拿真实 IPv4 并缓存 5 分钟；
  其它域名不动，DoH 失败时回退系统结果。`BLOXD_DNS_OVERRIDE=off` 可关闭。它靠包装
  `dns.lookup` 生效，Node 24 内置的 `WebSocket`（undici）也走这条路径，所以不需要替换
  Colyseus 的传输实现。
- 1.21.11 的实体 metadata 与 1.8 语义不同：字段 10（`EFFECT_PARTICLES`）是 List 而不是
  int，玩家段（吸收、分数、皮肤部件、主手）的索引发生移动，`PLAYER_MAIN_HAND` 变成
  `HUMANOID_ARM` 枚举。继续按 1.8 的 int/byte 发送，原版客户端会抛
  `Invalid entity data item type for field N` 并当场断开。`mc/client.js` 的
  `IGNORED_METADATA_KEYS` 显式丢弃这些装饰键（legacy 7/10/16/17/18），只保留
  flags、custom_name、health、air、effect ambience、arrow count 与掉落实体的 item
  stack。要恢复任何一项，必须先在真实 1.21.11 客户端上确认字段号与序列化类型。
