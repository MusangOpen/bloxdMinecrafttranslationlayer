# BloxdTranslationLayer 中文使用教程

本文面向第一次上手的使用者。维护、改协议、改资源包请阅读
[维护文档](MAINTENANCE.zh-CN.md)。

## 1. 这个项目是什么

BloxdTranslationLayer 是一个只在本机运行的中间层。它通过 Colyseus 连接 Bloxd，
把 Bloxd 协议解码后重新编码成 Minecraft 数据包，同时把 Minecraft 的操作翻译回
Bloxd 数据包。你最终看到的是一个 Minecraft 服务器，实际玩的是 Bloxd。

它不修改 Minecraft 客户端，也不是代理服务器，更不是把 Bloxd 变成 Minecraft 的
内容 mod。

## 2. 适用版本

| 项目 | 固定值 |
| --- | --- |
| Bloxd 目标构建 | `7rp1w.main.57cd8edd.js` (`7rp1w` / `57cd8edd`) |
| Bloxd 协议版本 | `856` |
| 主包 SHA-256 | `5b55225a3b3758475fb4a6538ba3170c05a26394fcd878deacf649ecc94dd205` |
| 固定抓取 | `353` 个 chunk |
| 资源包 | `bloxd-856.zip` |
| Minecraft Java | `1.21.11`（协议 `774`） |
| 资源包格式 | `75` |

协议锚点：设置包 id 为 `59`（wire 字段 `tFF`/`IFF`/`qFF`/`pFF`/`DFF`/`fFF`），入服包
id 为 `64`（wire 字段 `aE`/`qE`），keepalive id 为 `25`，analytics ping 为 `26`、
analytics update 为 `17`。相对上一个 854 固定点，856 保持 16218 个注册表键、1492 个
物品和 1271 个纹理数量不变；包 id 与 wire 字段名按 856 重新映射。

Fabric Loader 客户端走的是原版协议，所以可以直接连接。本项目不包含 Fabric mod、
Fabric API 文件或 Gradle 工程。你不需要安装任何客户端 mod。

版本对不上会被直接拒绝。服务端只接受协议 `774`，其它版本会收到
`Unsupported Minecraft protocol version` 并断开。

## 3. 环境要求与安装

- Node.js 22 或更高版本（本项目在 Node.js 24 上验证）。`package.json` 里写的是
  `engines.node: ">=22"`。
- Minecraft Java 1.21.11 客户端。离线账号、破解账号都可以。
- 一个能安装 Tampermonkey 或 Violentmonkey 的浏览器，用来生成 Turnstile 流量
  令牌。

依赖版本是精确固定的，锁文件也一并提交，请用 `npm ci` 而不是 `npm install`：

- `minecraft-protocol` `1.68.0`
- `minecraft-data` `3.117.0`
- `prismarine-chunk` `1.41.0`
- `prismarine-nbt` `2.8.0`

```bash
npm ci
```

## 4. 启动

```bash
npm start
```

内部实际执行 `node index.js`。启动顺序是刻意固定的，`index.js` 会强制保证：

1. **资源包预检（pack preflight）**
   在创建任何 socket 之前，同步校验资源包 ZIP、manifest、每个条目的 CRC、资源包
   格式，以及全部模型和纹理引用。任何一项不通过，进程直接失败，不会出现半启动
   状态。
2. **资源包 HTTP 服务**
   只绑定 `127.0.0.1` 并开始监听。监听失败会中止启动。默认端口为 `0`，由系统
   分配临时端口，实际地址通过资源包请求下发给客户端。
3. **Minecraft 服务端**
   只有资源包端点进入监听状态之后，1.21.11 服务端才开始接受客户端连接。这样
   客户端拿到资源包请求时，下载地址一定是可用的。

启动成功后控制台会打印版本信息，并执行一次登录检查与好友数据刷新。按 `Ctrl+C`
会走正常关闭流程，依次关闭资源包 HTTP 服务和 Minecraft 服务端。

## 5. 浏览器侧准备

资源包本身不需要浏览器，但连接 Bloxd 需要 Turnstile 令牌：

1. 在 Tampermonkey 或 Violentmonkey 中安装仓库根目录的 `tampermonkey.js`。
2. 打开 <https://bloxd.io>，并保持这个标签页开着。脚本会在页面里生成令牌。
3. 不要关闭标签页。令牌失效后重新打开或刷新页面即可。

脚本只在你自己的浏览器里向 Bloxd 页面申请令牌，不会把令牌写进仓库。

脚本会在页面右下角显示一个「新账号」按钮：点击并确认后，它会清掉 bloxd.io 在本浏览器
里的全部 cookie（含多个 path/domain 变体）和站点 sessionStorage，然后刷新页面，让站点
重新分配一个访客账号。它不会动其它本地设置；HttpOnly cookie 浏览器不允许脚本删除，
如果清完仍保持原账号，用浏览器自带的「清除站点数据」再试一次。

## 6. 连接并加载资源包

1. 启动 `npm start`，确认资源包 HTTP 已监听。
2. 在 Minecraft 1.21.11 中连接服务器地址 `localhost`。如果改了端口，地址写成
   `localhost:<端口>`。
3. 客户端会收到一个强制（`forced`）资源包请求。选择接受并等待下载完成。
4. 等待客户端回报 `SUCCESSFULLY_LOADED`。

在 `SUCCESSFULLY_LOADED` 之前，服务端不会发送位置、区块、实体、背包、装备，也
不会调用 Bloxd 的 `connect()`。也就是说，资源包没加载完就不会进入世界，这是
设计行为，不是卡住。

以下情况会直接结束连接：

- 拒绝资源包（`DECLINED`）
- 下载失败（`FAILED_DOWNLOAD`）
- 资源包 URL 无效（`INVALID_URL`）
- 重新加载失败（`FAILED_RELOAD`）
- 丢弃资源包（`DISCARDED`）
- 等待超时（`E_PACK_TIMEOUT`，默认 30 秒）

同一时间只允许一个客户端。第一个客户端的资源包还在加载时，第二个客户端会被
拒绝并提示已有玩家登录。

## 7. 游戏内命令

在 Minecraft 聊天框输入：

- `/play <gamemode> [room]`，别名 `/queue`
- `/party create|join|leave|info|list`，别名 `/p`

`/play` 通过 Minecraft 的 `chat_command` 数据包进入，与普通聊天走同一个处理器，
所以不会被客户端当成未知命令拦下。

仓库里还保留了若干原项目的聊天命令，例如 `/resync`、`/positions`、`/craft`、
`/kits`、`/perks`、`/maps`、`/nick`、`/autonick`、`/autobuy`、`/servername`、
`/f add|remove`。它们不在本教程的保证范围内，行为以代码为准。

## 8. 资源包说明

- 资源包只负责**物品外观和名称**：把 Bloxd 物品名映射到已有原版物品上的
  `item_model`、`custom_name`、lore 和物品组件。
- 不新增、也不注册任何物品或方块 ID。
- 不实现物品行为，不改变游戏逻辑。
- 没有 placed-block 视觉。放置后的方块仍然使用现有的 1.21.11 方块状态映射。
- 资源包在协议层面无法注册 ID 或实现行为，因此不要把它理解成“加了内容”。

启动时不会重新生成资源包，只会校验并服务仓库里已有的 ZIP 和 manifest。需要
重新生成时手动执行：

```bash
node bloxd/resource_pack/generate.js --out bloxd/resource_pack
```

生成过程是确定性的：条目路径排序、固定 DOS 时间戳、固定权限、固定压缩参数，
因此同样的输入会得到同样的 ZIP 和 SHA-256。服务端提供的就是这份 ZIP 的原始
字节，不会重新压缩。

## 9. 环境变量

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `MC_PORT` / `BLOXD_MC_PORT` | Minecraft 监听端口 | 未设置时由 `minecraft-protocol` 使用 `25565`；`MC_PORT` 优先于 `BLOXD_MC_PORT` |
| `MC_HOST` / `BLOXD_MC_HOST` | Minecraft 监听地址 | 未设置时 `minecraft-protocol` 监听所有网卡；建议显式设为 `127.0.0.1`；`MC_HOST` 优先 |
| `BLOXD_PACK_PORT` | 资源包 HTTP 端口 | 未设置时用 `0`，由系统分配临时端口 |
| `BLOXD_PACK_ZIP` | 资源包 ZIP 路径 | `bloxd/resource_pack/bloxd-856.zip` |
| `BLOXD_PACK_MANIFEST` | 资源包 manifest 路径 | `bloxd/resource_pack/manifest.json` |
| `BLOXD_PACK_TIMEOUT_MS` | 等待 `SUCCESSFULLY_LOADED` 的超时毫秒数 | `30000` |

端口或超时传入非法值时会被忽略并使用默认值，不会静默接受一个越界端口。

示例：

```powershell
$env:MC_PORT = "25565"
$env:BLOXD_PACK_PORT = "25566"
npm start
```

## 10. 常用命令

快速测试（原有 4 个套件）：

```bash
npm test
```

权威离线套件（22 个套件，release 前必须通过）：

```bash
npm run test:required
```

旧 840 编解码测试，当前是已知 RED，只保留作历史参考，不属于 856 绿色套件：

```bash
npm run test:codec
```

历史 846 协议兼容测试同样只保留作证据，不进入 856 的 required 绿色路径；不要删除它，
也不要用它替代 `protocol-856`。

其它独立检查：

```bash
node test/version-pins.js --final
node test/resource-pack.js --all
node test/resource-pack-protocol.js
node test/protocol-856.js
node test/integration-1.21.11.js --all
node test/docs-audit.js
node test/final-audit.js
```

失败路径自测（必须返回非零才算自测成功）：

```bash
node test/docs-audit.js --self-test all
node test/final-audit.js --self-test
node test/required-suite.js --self-test
node test/harness-self-test.js
```

重新生成资源包：

```bash
node bloxd/resource_pack/generate.js --out bloxd/resource_pack
```

`node test/integration-1.21.11.js --all` 通过只代表本机协议路径通过。它不是
Fabric UI 测试，无法证明真实客户端下载、加载或渲染了资源包。

## 11. 常见问题

**资源包缺失或损坏**

预检会在启动阶段失败，通常是 `E_PACK_*` 或 `E_ZIP_*` 错误码。确认
`BLOXD_PACK_ZIP` 和 `BLOXD_PACK_MANIFEST` 指向真实文件，或者重新运行
`node bloxd/resource_pack/generate.js --out bloxd/resource_pack`。

**`EADDRINUSE`**

端口被占用。换一个 `MC_PORT` 或 `BLOXD_PACK_PORT`，或者先结束占用端口的进程。

**连接游戏服务器时 TLS 握手失败**

日志出现 `Client network socket disconnected before secure TLS connection was
established`，并提示 `TLS handshake failed before the game server answered`。这是本机
DNS 被代理接管（Clash/TUN 的 fake-ip，解析结果落在 `198.18.0.0/15`）导致的：项目会自动
用 DoH 解析 `game-server-*.bloxd.io` 的真实地址，日志里会出现
`DNS: ... resolves to proxy fake-ip ... switching to DoH`。如果仍然失败，在代理软件里
把 `*.bloxd.io` 设为直连；设置 `BLOXD_DNS_OVERRIDE=off` 可以关闭这个兜底逻辑。

**客户端版本不对**

服务端只接受 1.21.11（协议 774）。启动日志会给出
`E_UNSUPPORTED_PROTOCOL_VERSION`，客户端会收到同样的提示后断开。

**资源包被拒绝或超时**

确认浏览器和服务器在同一台机器上，资源包 HTTP 已经在 `127.0.0.1` 监听，并且
客户端接受强制资源包。超时可以适度调大 `BLOXD_PACK_TIMEOUT_MS`。

**进入后没有世界或背包**

先确认客户端已经回报 `SUCCESSFULLY_LOADED`。在此之前没有世界数据是正常行为。
如果一直不完成，按上一条排查资源包下载。

**第二个客户端一直 pending 然后被拒绝**

这是单客户端门禁。等第一个客户端的资源包加载完成或连接结束后再试。

**连接 Bloxd 被拒绝或封禁**

live Bloxd 在当前环境下是 BLOCKED。之前的数据中心 IP 被 Bloxd 以规避封禁为由
拒绝。需要操作者自己有明确授权、有效的既有令牌，并且 Bloxd 可用。离线协议
测试不能证明真实登录或真实对局。

**Fabric 相关**

Fabric Loader 客户端使用原版协议，可以直接连。本项目不提供 Fabric mod。真实
Fabric UI、下载和渲染状态是 BLOCKED_UNVERIFIED，headless 测试不能替代真实
客户端验证。

## 12. 安全边界

- 资源包 HTTP 只绑定 `127.0.0.1`，并拒绝非回环 Host 的请求。不要把
  `BLOXD_PACK_PORT` 暴露到局域网或公网。
- Minecraft 监听地址由 `MC_HOST` / `BLOXD_MC_HOST` 决定。未设置时
  `minecraft-protocol` 会监听所有网卡，建议始终显式设为 `127.0.0.1`。
- 不要把资源包上传到任何第三方服务。所有下载都来自本机回环地址。
- 不要在仓库、脚本或日志中放入 token、cookie、密码或其它密钥。Turnstile 令牌
  只存在于你自己的浏览器会话里。
- 不要用它绕过 Bloxd 的登录、封禁、反作弊或其它限制。本项目只做协议翻译。

## 13. 外部验证状态

| 项目 | 状态 |
| --- | --- |
| live Bloxd（真实登录与真实对局） | BLOCKED |
| 真实 Fabric UI、下载、渲染 | BLOCKED_UNVERIFIED |
| headless 本地协议测试 | 可运行，但不是 Fabric UI 测试 |

文档与测试只声明本地可验证的部分。真实客户端和线上服务需要操作者自己具备
授权与环境后再验证。
