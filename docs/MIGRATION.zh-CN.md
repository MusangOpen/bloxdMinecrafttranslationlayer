# Bloxd 版本迁移流程（zh-CN）

本文是「Bloxd 线上构建换版本后，把本项目迁到新版本」的完整操作手册。它讲的是流程、
验收门槛和失败恢复；架构、模块职责和协议细节请看
[维护文档](MAINTENANCE.zh-CN.md)，日常使用请看 [使用教程](USAGE.zh-CN.md)。

迁移的判定标准只有一条：**`npm run test:required` 的 22 个套件全绿，并且能用真实
1.21.11 客户端加入 Bloxd 房间**。任一不满足就不算迁移完成。

## 0. 前置条件

- Node.js 22+，依赖已按 `package.json` 精确安装（`npm ci`）。
- 浏览器装有 `tampermonkey.js`，并且有一个已登录 bloxd.io 的标签页（提供 Turnstile
  token）。实机验证需要它。
- 有权限访问 `.research/` 下的历史证据；不要删除旧版本的 build、registry、pack 和提取器，
  它们是审计基线。
- 迁移期间不要改动 `.research/historical-before.sha256`，它只用于证明旧文件未被改写。

## 1. 阶段 0：确认线上版本真的变了

先证明问题来自版本，而不是代码回归。典型症状：

- 启动后登录正常（`Logged in as ...`），但排队或进房间失败，日志出现
  `Outdated version or unauthorized` 或 matchmake 返回 420。
- 线上主包文件名变了：`https://bloxd.io/static/js/<build>.main.<hash>.js`。

确认方式：打开 bloxd.io，查看页面加载的 main bundle 文件名与内容哈希，和
`bloxd/protocol/target.js` 里的 `build` / `buildVersion` 对比。

记录旧固定点的四个数字，后面写证据和文档要用：`build`、`buildVersion`、协议
`version`、主包 `sha256`。

不要在没确认版本变化的情况下进入下面的流程；先按维护文档的「失败路径自测」排查。

## 2. 阶段 1：只改 `bloxd/protocol/target.js`

这是唯一允许出现目标版本字面量的产品模块，其余模块（`live.js`、`client.js`、
`browser_info.js`、anticheat 常量、join payload）都从它派生。

需要更新的字段：

| 字段 | 说明 |
| --- | --- |
| `build` | 主包前缀，例如 `7rp1w` |
| `buildVersion` | 主包哈希段，例如 `57cd8edd` |
| `version` | Bloxd 协议版本号，例如 `856` |
| `sourceUrl` / `mainBundle.url` / `mainBundle.filename` | 新主包地址与文件名 |
| `mainBundle.sha256` | 下载后的真实 SHA-256 |
| `generatedManifestSha256` | 新 `generated/manifest.json` 的 SHA-256，提取后回填 |
| `transport.expKey` | 由派生脚本算出的 exp key；`sendKey` 保持 `11 * version + 7` |

顺序上先填能确定的值，`sha256` 和 `generatedManifestSha256` 在下载/提取之后再回填，
最后再跑一次 `node test/version-pins.js --final` 确认没有别处残留旧字面量。

## 3. 阶段 2：下载并冻结新构建

目录约定：`.research/builds/<build>-<buildVersion>/`，里面是主包 `main.js`、chunk 目录
和构建 manifest。

要求：

1. 主包与每个 chunk 都必须记录 SHA-256，构建 manifest 必须可复核（`verifyBuild` 通过）。
2. chunk 数量要和线上实际引用一致，并写进 `final-audit` 的期望值。
3. 冻结后不再改动；后续提取、派生都只读这份冻结证据。

## 4. 阶段 3：重新提取证据

提取器在 `.research/tools/extract-generic.cjs`（`extract-dump-generic.cjs` /
`extract-dump2-generic.cjs` 用于导出原始注册表）。它不绑定具体 build，读的是
`.research/builds/` 下的冻结目录，因此版本迁移不需要改提取器。

产物放 `.research/<build>-audit/generated/`：`inbound-schemas.json`、
`outbound-schemas.json`、`inbound-ids.json`、`outbound-ids.json`、
`registry.json`、`assets.json`、`transport.json`、`manifest.json`。

硬性验收（任一不满足就是提取失败，不要往下走）：

- `ambiguousRoles` = 0
- `missingAssets` = 0
- `sandboxConstructorEscapes` = 0
- 入站/出站 ID 表与 schema 表能被后续映射脚本完整消费

提取完把 `manifest.json` 的 SHA-256 回填到 `target.js` 的
`generatedManifestSha256`。

## 5. 阶段 4：重建包 ID 与字段映射

这一步决定「旧 handler 还能不能继续用」。做法是拿旧版本的 ID/字段表和新证据对齐：

1. `map-<old>-<new>.js`：按序号 + 结构签名（`structsig.js`）对齐入站/出站 ID，
   输出 `id-map.json`。JSON 形态的包按 payload 签名匹配，不要只靠序号。
2. `build-mapping.js`：把旧 handler 名与本地字段名映射到新 ID，输出 `mapping.json`
   和 `wire-compat-<version>.json`（本地字段 → wire 字段）。
3. 人工复核低置信度条目：只在能给出结构或调用点证据时才接受，否则保留为
   `unsupported` 并 fail closed。

验收：入站、出站的每个 ID 都必须有处置（implemented / ignored / unsupported），
不允许「没对上就跳过」的静默缺口。

## 6. 阶段 5：重新生成产物

按依赖顺序执行，每步都读上一步的产物：

1. **协议描述符**：`gen-live-<version>.cjs` → `bloxd/protocol/live.js`。
   同时生成 `PROTOCOL_LEDGER`，包含入站/出站处置和 wire 字段名映射。
2. **传输常量与向量**：`derive-transport-<version>.cjs`（exp key）与
   `derive-transport-vectors-<version>.cjs`（`test/transport.js` 用的固定向量）。
   这两个脚本在惰性 VM 里执行真实 send 模块，不硬编码混淆后的语句文本。
3. **注册表**：`gen-registry-<version>.cjs` → `bloxd/types/registry-<version>.json`。
   校验展开键数（当前 16218）、物品数（1492）、atlas 条目（1227）与 `registry.json` 对齐。
4. **资源包**：更新 `bloxd/resource_pack/generate.js` 的构建路径、PNG chunk 列表、
   映射 chunk、注册表路径、包名、期望哈希和例外纹理白名单，然后
   `node bloxd/resource_pack/generate.js --out bloxd/resource_pack`。
   - PNG chunk 必须来自冻结构建里真实存在的文件，数量要与 `png-scan` 记录一致。
   - 新增「证据里缺失」的纹理只能进显式白名单，每条都要给出数字 id 与原因。
   - 生成后核对 ZIP 条目数、真实纹理数、占位符数。
5. **产品侧引用**：`bloxd/types/items.js` 指向新注册表，
   `bloxd/resource_pack/server.js` 默认 ZIP 指向新包。

## 7. 阶段 6：测试与审计

先改测试，再跑套件：

1. 新建 `test/protocol-<version>.js`，删除/归档上一版同名套件；断言协议版本、
   sendKey、关键包 ID、ledger 覆盖率、wire 字段名。
2. 更新 `test/transport.js` 的 PINNED 常量、构建路径与向量文件。
3. 更新 `test/resource-pack.js` 的包名、哈希、条目数与构建路径。
4. 更新 `test/required-suites.json`：套件 ID、`pack` 段哈希/大小/条目数、
   `protocol-<version>` 依赖、版本相关元数据。**所有 `protocol-<old>` 引用必须清干净**，
   否则整套会以 `MANIFEST_PROBLEM` 失败。
5. 更新 `test/final-audit.js`：构建目录、chunk 数、注册表路径、资源包哈希、
   历史条目（旧 registry / 旧 pack 保留为证据）。
6. 更新 `test/docs-audit.js` 的版本常量（构建文件名、协议号、包名、哈希）。

然后按顺序跑：

```bash
node test/version-pins.js --final
node test/protocol-<version>.js
node test/transport.js
node test/resource-pack.js --all
node test/docs-audit.js
node test/final-audit.js
npm run test:required
```

`npm run test:required` 必须 22/22 全绿且 `failures=0`；`docs-audit` 必须
`falseClaims=0`、`commandsValid=1`。任何套件失败都按真实失败处理，不要删断言、
不要跳过、不要注释掉。

## 8. 阶段 7：文档与证据

必须同步的文件：

- `README.md`：目标构建、协议版本、主包哈希、chunk 数、资源包名与哈希、依赖 pin。
- `docs/USAGE.zh-CN.md`：目标事实表、协议锚点（包 ID 与 wire 字段）、命令示例。
- `docs/MAINTENANCE.zh-CN.md`：第 3 章摘要、协议/资源包/测试章节里的版本数字。
- `.omo/evidence/`：新增 `live-auth-<version>.json`、`live-join-<version>.json`、
  `task-*.json` 等证据；`test/required-suites.json` 里引用的证据文件必须存在。

三条硬规则：

1. **只改文档文本，不要用带 `$` 的 `String.replace` 替换串**。替换串里的 `` $` ``
   会被当成「匹配前全文」，一次操作就能把整篇文档复制成两份（本项目真的发生过）。
   需要脚本改文档时用 `split(...).join(...)`。
2. 旧版本的事实要么删掉，要么明确标成「历史证据」。不要留下会被误读为当前值的
   旧哈希、旧包名、旧包 ID。
3. `docs-audit` 是文档的验收器：它会检查 README 与两篇中文文档的事实一致性，
   改完必须重新跑。

## 9. 阶段 8：实机验证

离线套件只能证明协议结构，不能证明线上可用。实机步骤：

1. 关闭占用端口的旧进程（浏览器桥固定端口 6874/6876；`EADDRINUSE` 就是旧进程没退）。
2. 打开 bloxd.io 标签页，确认浏览器桥连上。
3. 运行探针：`.research/trkzmh-853-audit/live-attempt.js`（目录名沿用 853，脚本内部
   已指向当前审计目录与构建）会启动 `index.js`、等待桥接、用真实 `minecraft-protocol`
   客户端登录，并统计 Minecraft 侧收到的包。
4. 判定标准：
   - 登录成功，出现 `Social shard` 与 `Joined Bloxd room`；
   - 服务端包按新版本正确解码（JoinGame、ServerSetting、Teleport 等名字正确）；
   - Minecraft 侧收到 `map_chunk`、`chunk_batch_*`、实体包，且 `errors` 为空；
   - `stderr` 为空、无崩溃、无 `unsupported` 洪水。
5. 把结果写进 `.omo/evidence/.../live-join-<version>.json`，并在 notepad 记录。

探针退出码 3 表示「观测窗口内客户端一直在线」，属于健康超时，不是失败。

## 10. 失败恢复与禁止事项

按症状排查，不要在没定位原因时连续改动：

| 症状 | 首要怀疑 | 处理 |
| --- | --- | --- |
| 420 / `Outdated version or unauthorized` | 线上版本已 bump | 回到阶段 0，确认 build 与 version |
| `Connecting to wss://undefined` | matchmake 字段改名 | 检查 `gameServerHost` 读取与 fail-closed 守卫 |
| Colyseus 4066 `invalidOnJoinArgs2` | join payload 契约变化 | 对照新构建里的 join 调用点逐字段核对 |
| `refId not found` / `field not defined` | schema 大版本不匹配 | 对齐 `colyseus.js` 与 `@colyseus/schema`，用 `getStateCallbacks` |
| 房间内崩溃 `client.write` after close | 状态回调未做断开守卫 | 回调开头检查 `client && !client.ended` |
| 物品名解析失败（例如 `E_UNRESOLVED_ITEM_NAME`） | 物品走的是 item-registry id | 把 `numericIdView` 折进 `IDITEM`/`ITEMID` |
| `EADDRINUSE` | 旧 layer 进程占端口 | 结束旧进程后重跑；不要改端口掩盖问题 |
| 一次 TLS `ECONNRESET` 到 game-server | 对方瞬时故障 | 同命令重试一次；持续失败才查协议 |
| 文档出现整篇重复 | 替换串里的 `` $` `` | 用 `split/join` 重写，不要用 `String.replace` |

禁止事项：

- 禁止把版本字面量写进 `target.js` 以外的产品模块。
- 禁止跳过未映射的包或未知字段「先跑起来再说」，一律 fail closed。
- 禁止删除失败断言、跳过套件、修改期望值来让套件变绿。
- 禁止改 `.research/historical-before.sha256` 或改写历史证据。
- 禁止在没有实机证据时把 live 状态写成已验证。

## 附录 A：854 迁移实例（2026-11-11）

上一固定点是 `trkzmh` / `ee8a864d` / 853（228 chunk，sendKey 9390），线上切到
`itj4su.main.d11e9e80.js` 后，853 的排队立刻返回 420。

| 项目 | 853 | 854 |
| --- | --- | --- |
| build / buildVersion | `trkzmh` / `ee8a864d` | `itj4su` / `d11e9e80` |
| 协议版本 | 853 | 854 |
| 主包 SHA-256 | （历史证据） | `70e78ab6546e869cbd4ce575abdd748c067b6e82666b9558475a02e79ca366d5` |
| chunk 数 | 228 | 265 |
| sendKey / expKey | 9390 / 132 | 9401 / 27 |
| 设置包 ID（wire） | 60 | 54（`gR`/`lnf`/`uR`/`pR`/`fn`/`onf`） |
| join 包 ID（wire） | 108（`iL`/`jL`） | 28（`Qp`/`Iw`） |
| analytics ping / update | 50 / 93 | 38 / 80 |
| keepalive | 20 | 20 |
| 注册表键 / 物品 / atlas | 16218 / 1492 / 1227 | 16218 / 1492 / 1227 |
| 资源包 | `bloxd-853.zip` | `bloxd-854.zip`，`3d81159e7f6ee6905425344ac07e4827d551a70ee50c46d25dc03fca970a7c3f`，4256 条目 |

这次迁移的实际情况：

1. 入站 103 个 ID 按序号 + 结构签名全部对上；出站 75 个直接映射、6 个 JSON 形态按
   payload 签名匹配、6 个只存在于 schema 的 ID 按排除法配对，没有静默缺口。
2. handler 面向的 schema 与字段映射基本不变，`live.js` 只重新生成了 ID、证据、ledger 和
   wire 字段名，所以 handler 代码不需要大改。
3. 注册表数量不变但内容哈希变化，`registry-854.json` 与资源包都重新生成；新增 3 个
   「证据里缺失」的纹理走显式白名单（`brown_paint_bow_charging_3`、
   `explosive_paint_sticky_black`、`sanguine_bow`）。
4. 测试侧：新增 `test/protocol-854.js`（15 项）、`transport` 换成 854 向量（13 项）、
   `required-suites` 清掉 3 处残留的 `protocol-853` 依赖，最终 22/22、823 断言。
5. 文档侧踩了两次坑：一次替换串含 `` $` `` 把 MAINTENANCE 复制成两份；一次替换把
   README 清成 0 字节。修复后 `docs-audit` 才通过（`target854=1`、`commandsValid=1`）。
6. 实机：第一次尝试在 TLS 握手阶段被 game-server 重置，重试后成功加入 skywars
   Lobby 4，Minecraft 侧收到 `map_chunk` 636、`entity_teleport` 4998、
   `block_change` 327、`set_slot` 132，`errors` 为空。证据在
   `.omo/evidence/update-bloxd-mc-1-21-11-fabric/live-join-854.json`。
7. 进服后日志暴露 `/social/undefined/persisted/keep-alive` 与
   `/social/undefined/images/Diorite.png` 两条 404。原因是旧 handler 用了一个从未赋值的
   `bClient.ip`，而 854 构建里已经没有这两个社交端点。处理：删掉这两条 decoy 请求和
   由失败 HTTP 推导的 ping，`BloxClient.ip` 改为保存 matchmake 的原始
   `gameServerHost` 供派对位置比较。注意它与 Colyseus 的包级 keepalive 是两回事，
   后者属于另一个尚未补齐的协议保真缺口，不要混为一谈。

## 附录 B：命令速查

```bash
# 目标校验
node test/version-pins.js --final

# 提取与映射（研究脚本，按顺序）
node .research/tools/extract-generic.cjs
node .research/<build>-audit/map-<old>-<new>.js
node .research/<build>-audit/build-mapping.js

# 生成产物
node .research/<build>-audit/gen-live-<version>.cjs
node .research/<build>-audit/derive-transport-<version>.cjs
node .research/<build>-audit/derive-transport-vectors-<version>.cjs
node .research/<build>-audit/gen-registry-<version>.cjs
node bloxd/resource_pack/generate.js --out bloxd/resource_pack

# 验收
node test/protocol-<version>.js
node test/transport.js
node test/resource-pack.js --all
node test/docs-audit.js
node test/final-audit.js
npm run test:required

# 实机
node .research/trkzmh-853-audit/live-attempt.js
```

脚本的具体参数以各脚本头部注释为准；`.research/` 只用于离线证据生成，产品运行时不读它。
