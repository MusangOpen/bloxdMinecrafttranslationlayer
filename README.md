# BloxdTranslationLayer (Minecraft 1.21.11)

A localhost middleman that lets a **Minecraft Java 1.21.11** (protocol 774) client play
**Bloxd.io**. It connects to Bloxd over Colyseus, decodes the Bloxd protocol, re-emits it as
Minecraft packets, and translates Minecraft input back into Bloxd packets.

Fabric Loader clients use the vanilla protocol; this project does not ship a Fabric mod, Fabric
API files or a Gradle project.

## Documentation

- [中文使用教程 (Usage guide, zh-CN)](docs/USAGE.zh-CN.md)
- [中文维护文档 (Maintenance guide, zh-CN)](docs/MAINTENANCE.zh-CN.md)
- [中文版本迁移流程 (Version migration runbook, zh-CN)](docs/MIGRATION.zh-CN.md)

## Repository layout

| Path | Responsibility |
| --- | --- |
| `index.js` | startup order: pack preflight -> pack HTTP -> Minecraft server |
| `bloxd/protocol` | `target.js` (the only version literals) and the generated `live.js` descriptor |
| `bloxd/handlers` | Bloxd packet semantics -> legacy Minecraft semantics |
| `bloxd/types` | static tables plus the generated `registry-856.json` |
| `bloxd/resource_pack` | deterministic generator, localhost pack server, `bloxd-856.zip` and `manifest.json` |
| `mc` | 1.21.11 adapter: client, chunk encoder, registry/components, join gate |
| `test` | required suites, fixtures, audits and evidence checks |
| `docs` | Chinese usage, maintenance and migration guides |
| `reference` | historical reference only: legacy `physics` Java snippets |
| `game` | historical reference only: old Bloxd chunks, never product code |
| `.research` | frozen builds, generated evidence and one-off extraction scripts |
| `.omo` | plans and evidence logs for this workspace |
| `node_modules` | installed dependencies |

Entry-point files stay in the repository root: `index.js`, `package.json`,
`package-lock.json`, `tampermonkey.js`, `1.bat`, `README.md` and `LICENSE.md`. Files under
`.research`, `.omo` or `reference` are evidence or historical reference, never product code.

## Compatibility target

- Target build: `7rp1w.main.57cd8edd.js` (`7rp1w` / `57cd8edd`)
- Bloxd protocol version: `856`
- Main bundle SHA-256: `5b55225a3b3758475fb4a6538ba3170c05a26394fcd878deacf649ecc94dd205`
- Minecraft Java: `1.21.11` (protocol `774`)
- Resource-pack format: `75`
- Pinned capture: `353` chunks
- Resource pack: `bloxd-856.zip` (`2a08bb541acb426963d30a58f40b7823efac7656f713700ccca0aa244b028ee4`)

The canonical target descriptor is `bloxd/protocol/target.js`. Do not patch protocol version
literals into other product modules.

Compared with the previous 854 pin, Bloxd 856 keeps 16218 registry keys, 1492 items and 1271
textures; packet ids and wire field names were remapped. The generated descriptors carry
settings id `59` (wire `tFF`/`IFF`/`qFF`/`pFF`/`DFF`/`fFF`), join id `64` with wire fields
`aE`/`qE`, keepalive id `25`, analytics ping `26` and analytics update `17`.

Historical note: this README supersedes the earlier Bloxd 840/846 rewrites and the 854 pin.
Those instruction sets are historical evidence only, obsolete, and must not be used.

## Requirements

- Node.js 22+ (tested on Node.js 24).
- A Minecraft Java **1.21.11** client. Offline/cracked accounts are fine.
- A browser with the included Tampermonkey script, for the Turnstile traffic token.

The verified dependency pins are exact, and the lockfile is tracked:

- `minecraft-protocol` `1.68.0`
- `minecraft-data` `3.117.0`
- `prismarine-chunk` `1.41.0`
- `prismarine-nbt` `2.8.0`
- `colyseus.js` `0.16.22` with `@colyseus/schema` `5.0.45` (Bloxd 856 state schema; forced via `overrides`)

## Install and start

```bash
npm ci
npm start
```

Startup order is deliberate and enforced by `index.js`:

1. **Pack preflight** — the resource-pack ZIP, manifest, entry CRCs, pack format and every
   model/texture reference are validated synchronously before any socket exists.
2. **Pack HTTP** — the localhost-only resource-pack server binds `127.0.0.1` and starts
   listening. Startup aborts if it cannot listen.
3. **Minecraft server** — only after the pack endpoint is listening does the 1.21.11 server
   accept a client.

Then:

1. Install `tampermonkey.js` in Tampermonkey/Violentmonkey.
2. Open https://bloxd.io and keep the tab open so the traffic token is generated.
3. Join `localhost` from Minecraft 1.21.11.

Optional environment variables: `MC_PORT`/`BLOXD_MC_PORT`, `MC_HOST`/`BLOXD_MC_HOST`,
`BLOXD_PACK_PORT`, `BLOXD_PACK_ZIP`, `BLOXD_PACK_MANIFEST` and `BLOXD_PACK_TIMEOUT_MS`.
`BLOXD_DEBUG_PACKETS` enables inbound packet logging and the join state key dump.

## Resource pack

The pack is built deterministically from the pinned 856 evidence with Node built-ins only:

```bash
node bloxd/resource_pack/generate.js --out bloxd/resource_pack
```

This writes `bloxd/resource_pack/bloxd-856.zip` and `bloxd/resource_pack/manifest.json`.
Rebuild only when the pinned target evidence changes; the generated pack is kept in the workspace.

Serving is automatic. `npm start` starts the pack HTTP server from the generated ZIP and
manifest; there is no separate serve command. The server binds `127.0.0.1`, refuses non-loopback
hosts, serves the exact ZIP bytes with a SHA-1-derived identity, and derives a deterministic
UUID/URL from that identity.

Loading is gated. After the client finishes configuration, the server sends exactly one play
login and one `forced` `add_resource_pack`. Position, chunks, entities, inventory, equipment and
the Bloxd `connect()` call are withheld until the client reports `SUCCESSFULLY_LOADED`. Decline,
download failure, invalid URL, reload failure, discard and timeout end the connection. A second
client is rejected while the first pack load is pending.

### Item scope

**Item visuals and names only.** The pack maps Bloxd item names to `item_model`, `custom_name`,
lore and item components on existing vanilla base items. It does not add or register new
item/block ids, does not implement item behavior, and there are no placed-block visuals. Block
appearance still comes from the existing 1.21.11 block-state mapping.

A resource pack cannot register item/block ids or implement item behavior. Do not describe this
pack as adding content.

## In-game commands

- `/play <gamemode> [room]` (alias: `/queue`)
- `/party create|join|list` (alias: `/p`)

`/play` works through Minecraft's command packet (`chat_command`), which the adapter forwards to
the same handler as normal chat.

## Tests and audits

```bash
npm test
node test/version-pins.js --final
node test/resource-pack.js --all
node test/resource-pack-protocol.js
node test/protocol-856.js
node test/integration-1.21.11.js --all
node test/docs-audit.js
node test/final-audit.js
```

The docs audit self-tests must exit nonzero when a bad claim is injected:

```bash
node test/docs-audit.js --self-test stale-840
node test/docs-audit.js --self-test stale-846
node test/docs-audit.js --self-test node-18
node test/docs-audit.js --self-test fabric-tested
node test/docs-audit.js --self-test resource-pack-adds-items
```

`npm test` runs the legacy quick suite (`test/transport.js`, `test/e2e-mc.js`,
`test/e2e-packets.js`, `test/handlers-smoke.js`). The historical `test/codec.js` 840 schema
check is preserved as `npm run test:codec` but is intentionally excluded from the green quick
suite. `npm run test:required` remains the authoritative offline/local suite. It runs 22 suites:
capture manifest, extraction, self-tests, version pins, docs audit, the 856 protocol harness,
transport, the three end-to-end suites, seven `mc-adapter` scopes, the resource pack, the pack
protocol gate, the 1.21.11 integration scenario and the final audit. The historical
`test/protocol-846.js` compatibility harness is preserved but excluded from the required green
path.

Passing `node test/integration-1.21.11.js --all` is local protocol evidence only. It is not a
Fabric UI test. It asserts real title text (action 0), subtitle text (action 1) and exact title
times, so the title pipeline is not a blocker; this is still not a full integration claim and
does not clear live Bloxd or Fabric UI verification.

## Known limitations and honest status

- **Live Bloxd is BLOCKED** unless the operator has explicit authorization, a valid
  pre-existing token and Bloxd is available. The offline protocol tests cannot prove live login
  or gameplay.
- **Actual Fabric UI/download/render is BLOCKED_UNVERIFIED.** Headless local protocol tests are
  not Fabric UI tests and cannot prove that a real client downloaded, loaded or rendered the
  pack.
- **Task 23 is no longer blocked on title semantics.** The local integration scenario emits both
  `middleTextUpper` (large text) and `middleTextLower` (small text) and asserts real
  `set_title_text` (action 0), `set_title_subtitle` (action 1) and exact title times. Title,
  subtitle and times are now real. Passing the headless test is still not a full integration claim
  and does not clear live Bloxd or Fabric UI verification.
- The Colyseus room state uses `@colyseus/schema` 5. It is decoded through
  `getStateCallbacks`; the older `onAdd` / `listen` API does not exist in that major version.
- No new item or block ids are registered by this project or its resource pack.
- There are no placed-block visuals. Placed blocks use the existing 1.21.11 block-state mapping.
- The 856 server-settings packet is mapped from the generated 856 schema and handler evidence
  (id 59, wire fields `tFF`/`IFF`/`qFF`/`pFF`/`DFF`/`fFF`). Unknown or malformed settings fail
  closed instead of being silently guessed.
- Bloxd particle emitters are approximated with vanilla particles.
- Sign text updates are emitted via `update_sign` -> `tile_entity_data` (action 8) with NBT
  front/back text. Actual Fabric client rendering of sign updates remains `BLOCKED_UNVERIFIED`.
- Movement payloads include the new physics fields with conservative defaults; the server-side
  anticheat may require tuning (`gD`/`Mi`/`hiq`/`Si`/`kE`).
- The 557-era `CPacketConstantDetection*` probes are intentionally not sent; the 856 client no
  longer uses them.
- Resource-pack textures are derived deterministically from pinned evidence. That proves pack
  integrity, not client-side rendering.

## Credits and license

Original project by 7GrandDad. Rewritten for Minecraft 1.21.11 and Bloxd 856. See `LICENSE.md`.
