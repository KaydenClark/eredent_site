# Kiros toolkit

The agent tools (skills, plugins, MCP servers) worth having for this project, now that it is a working web world
with an open path toward a book, a game and possibly Steam. Researched 2026-10-10, starting from
[aiformortals.co](https://www.aiformortals.co/) and widening to the rest of the ecosystem.

Star counts are approximate. Install commands are quoted as each project documents them. None of them have been run
here. Nothing third-party is installed yet; each install is a decision for the owner.

## Already built (in this repo)

| Tool | What it does |
| --- | --- |
| `.claude/skills/kiros-verify` | Drive the site through `window.kiros`. Pose the camera (`goPlace`, `rig.t/.c`), render with `kiros.tick(n)` so a hidden browser pane can't stall it, screenshot, and time frames with a `readPixels` sync. Guards against the 0×0 canvas a hidden pane leaves. Tested on 2026-10-10: `s-forest` walk, 3.2 ms per frame at 1024×768. |
| `.claude/skills/kiros-pipeline` | Rebuild layers from the drawings, run a variant, run the acceptance checks, and prove by md5 that the default build is untouched. |
| `.claude/skills/kiros-canon` | Where each kind of truth lives (spec, drawings, Obsidian vault, Gods doc), the rule that anything made up is a proposal, and the open questions. |
| `.claude/launch.json` + `vite.config.js` | The dev server takes its port from `PORT` (`autoPort`), so several sessions can preview at once. This used to collide on 5173. |

`kiros.tick(n)` already gives Kiros what other projects add as an `advanceTime` hook (OpenAI's
`develop-web-game` pattern): deterministic frames for agents. It also makes frame-by-frame clip capture possible.

## Tier 1: worth installing now

These fix problems this project has already had: GPU precision bugs, performance measured in a throttled pane, and
three.js API drift.

| Tool | Why for Kiros | Install | Notes |
| --- | --- | --- | --- |
| **Chrome DevTools MCP** (Google, ~53k★, active) | Real performance traces, CPU throttling, viewport emulation and heap snapshots on the real GPU, not the 30 fps pane. | `claude mcp add chrome-devtools --scope user -- npx chrome-devtools-mcp@latest --no-usage-statistics --no-performance-crux --isolated` | Telemetry is on by default (the flags turn it off). Use an isolated profile, never your signed-in Chrome. |
| **Spector.js MCP** (BabylonJS, official) | WebGL frame capture with every draw call, shader source and compile status, uniforms, textures and GL state. The right tool for black tiles, wrong uniforms and instancing draw-call counts. | Not on npm: clone `BabylonJS/Spector.js`, run `npm run mcp:install && npm run mcp:build`, then point MCP at `node <repo>/mcp/dist/index.js`. | Headless, software-rendered GL: good for state, useless for timings. The build downloads Playwright Chromium. |
| **Context7** (Upstash, ~63k★) | Current three.js docs (`/mrdoob/three.js`), so agents stop mixing r170 calls with r180+ ones (TSL and WebGPU changed a lot). | `/plugin install context7@claude-plugins-official` | Queries go to Upstash's cloud. Tell it which revision the project uses (r170). |
| **threejs-game-skills**, only `threejs-qa-release` and `threejs-debug-profiler` (majidmanzarpour, ~2.5k★, updated Sep 2026) | Canvas pixel inspector (fails a blank canvas), a bot-playtest template, a disciplined profiling routine. Complements `kiros-verify`. | `npx skills add majidmanzarpour/threejs-game-skills --skill threejs-qa-release --skill threejs-debug-profiler -a claude-code` (project scope; leave out `-g -y`) | Ships Node and Python scripts. Read them before the first run. Skip its generator and director skills. |

Read, don't install: **CK42BB/procedural-landscapes-threejs** (9★). It covers this exact stack: fBm, ridged
multifractal, domain warp, chunked LOD, slope materials, instanced vegetation. Its trust signal is tiny, so borrow
ideas from it rather than depend on it.

Also optional: **CloudAI-X/threejs-skills** (~3k★, unchanged since Jan 2026). A general three.js reference that is
fine but knows less than this codebase. Its README's install command points to an unrelated repo, so use
`npx skills add cloudai-x/threejs-skills`.

## Tier 2: when the work reaches it

| When | Tool | Why | Install / needs | Notes |
| --- | --- | --- | --- | --- |
| Getting people to see it | **itch.io butler** | Push the same `dist/` as a browser-playable page in minutes, for free. A real audience and feedback channel before any Steam commitment. | `butler login`, then `butler push dist <user>/kiros:html5` | Decide first what is public (see the handoff's note on map thumbnails under `public/`). |
| Getting people to see it | **Frame-stepped flythrough clips** (method from aiformortals' auto-post post) | Pin the clock, step frames with `kiros.tick`, screenshot each one at 4K, and stitch to 60 fps with FFmpeg. Built-in Playwright video gives soft, choppy 3D. | Needs FFmpeg (not installed on this machine). | This would make a good next project skill, `kiros-clip`: short fly-downs to share. |
| Real trees, creatures and dragons replace the stand-ins | **MCP for Blender** (ahujasid, ~30k★) + **blender-production** skill (aiformortals) | Script Blender to build hero assets and export them as GLB. Saved `blender --background --python` scripts for repeatable builds, MCP for inspection. That is the pipeline every aiformortals 3D game used. | `uvx mcp-for-blender setup`; `npx skills add per-simmons/blender-production`. Needs Blender. | `execute_blender_code` runs any Python, and the socket has no authentication. Set `BLENDER_MCP_SAFE_MODE=1` and `DISABLE_TELEMETRY=true`. |
| GLBs enter the build | **gltf-transform CLI** | Draco/Meshopt and KTX2 compression, plus validation for web delivery. | `npx @gltf-transform/cli ...` from Bash; no MCP needed. | |
| Text or image to 3D drafts | **Meshy MCP** (official) | Concept meshes for creatures, rigged and animated, exported as GLB. | `npx add-mcp @meshy-ai/meshy-mcp-server --env MESHY_API_KEY=...` | Paid credits. Check the licence on generated output before it ships. |
| Sound beyond the synthesized ambience | **ElevenLabs hosted MCP** | Sound effects, music and voice (narration for the book side). | `claude mcp add --transport http elevenlabs https://api.elevenlabs.io/v1/mcp`, then sign in. | Paid credits beyond a free tier. The old local `elevenlabs-mcp` is archived. |
| Canon and lore in the vault | **mcpvault** (bitbonsai, ~1.6k★) | Read and search the Azlemzyk Obsidian vault directly, without Obsidian running. | `npx @bitbonsai/mcpvault`, pointed at `E:\GPT_OS\Projects\Azlemzyk\Azlemzyk Obsidian Vault` | Use v0.14.1 or later (it fixes a Windows path bypass). Back up the vault before allowing writes. |
| Worldbuilding for the book | **jwynia/agent-skills**, creative set | About 11 worldbuilding skills (cultures, belief systems, economies, conlangs) plus `shared-world`, a wiki-style world bible that tracks canon status. Fits the pantheon's loose threads. | `npx skills add https://github.com/jwynia/agent-skills/tree/main/skills/creative` | No licence stated. Pick a few skills; don't take the whole set. |

## Tier 3: only after a decision

The memory and the handoff agree: pick the game's genre before choosing an engine. The pipeline outputs (16-bit
elevation PNG, biome masks, meta JSON) carry over to any engine.

| Decision | Tools | Notes |
| --- | --- | --- |
| Stay web, ship on Steam | Electron + **steamworks.js** (ceifa); **gamedev-skills `steam-publish`** | The renderer needs `nodeIntegration`, so load only packaged local files. Steam Direct is $100, refunded after $1,000 in sales. The Coming Soon page must be up 2 weeks or more, and review takes 3 to 5 days. Use Electron rather than Tauri (Tauri uses each OS's own webview, so WebGL behaves differently on each). |
| Move to Godot (Godot is already at `E:\Godot`) | **Coding-Solo/godot-mcp** (~6k★, small and auditable); **GDAI MCP** for screenshots and input (check the price); GodotPrompter skills | The best fit if Kiros becomes a real game: free, text scene files, GodotSteam, and it can still export to the web. `claude mcp add godot -- npx @coding-solo/godot-mcp` |
| Move to Unreal | Epic's official MCP plugin (UE 5.8) + **unreal-agent-harness** (aiformortals, ~200★) | First-party but experimental, and heavy for one person. The harness's capture → JSON → correct loop is worth copying anyway. |
| Move to Unity | **CoplayDev/unity-mcp** (~15k★, weekly releases) | The most mature engine MCP, but Unity's official route needs a subscription. |
| Formal game production | **Claude Code Game Studios** (Donchitos, ~26k★): take single skills such as `/design-review`, `/playtest-report` | Don't adopt the whole framework into this repo: it brings its own hooks and layout. Beware the lookalike forks. |
| Visitor analytics once shared | **PostHog MCP** (official) | Free tier. Only if the owner wants numbers; it adds a tracker to the site. |

## Skip

- **fmg-mcp** (Azgaar map generator): odd owner, stale, runs arbitrary JS. The Python pipeline is the better map
  source anyway.
- **Bulk skill dumps** (sickn33 and the other mega-aggregators): mixed quality and scraped content.
- **lackeyjb/playwright-skill**, **dev-browser**, **Playwright MCP**: duplicate the `playwright` skill and the
  browser pane already here.
- **threejs-devtools-mcp**: single maintainer, quiet since March, injects into the page, and takes port 9222
  (the Chrome debug port that DevTools MCP also uses). Try it once at most.
- **webgpu-threejs-tsl** (dgreenheck): excellent, but written for r183+ WebGPU. Revisit only if Kiros moves to
  WebGPURenderer. The aiformortals storm-sea and Charybdis builds are the reference for that move: Gerstner/FFT ocean,
  shared sky function.
- **Google Playground**, **Clone App Pat Pro**, **Fable Orchestration**, **SimmonsBench fanout** (macOS and iTerm
  only), and the Premiere/Seedance skills: not for this project.

## Lessons from the aiformortals builds

- Every strong 3D build forced screenshot self-review passes. One ship came out a "flat blob" until the prompt
  demanded three. `kiros-verify` is that loop.
- Don't trust "done": one model reported finished without compiling. Run `npm test`, `npm run build`, and reopen in a
  fresh process.
- Agents play better with exposed state than with pixels alone. `kiros.tick` returns `rig.view` for that reason.
- Long runs get expensive through context growth, and quality drops late. Hand off between sessions.

## Sources

- aiformortals: [skills](https://www.aiformortals.co/skills), [built by Pat](https://www.aiformortals.co/built-by-pat),
  [Blender Fallingwater post](https://www.aiformortals.co/blog/gpt-6-astra-blender-fallingwater),
  [auto-post builds](https://www.aiformortals.co/blog/auto-post-builds-to-x)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp),
  [Spector.js](https://github.com/BabylonJS/Spector.js), [Context7](https://github.com/upstash/context7),
  [threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills),
  [procedural-landscapes-threejs](https://github.com/CK42BB/procedural-landscapes-threejs),
  [openai/skills](https://github.com/openai/skills)
- [MCP for Blender](https://github.com/ahujasid/mcp-for-blender),
  [blender-production](https://github.com/per-simmons/blender-production),
  [Meshy MCP](https://docs.meshy.ai/en/api/ai), [ElevenLabs MCP](https://elevenlabs.io/mcp),
  [mcpvault](https://github.com/bitbonsai/mcpvault), [jwynia/agent-skills](https://github.com/jwynia/agent-skills)
- [steamworks.js](https://github.com/ceifa/steamworks.js),
  [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills),
  [butler](https://itch.io/docs/butler/pushing), [godot-mcp](https://github.com/Coding-Solo/godot-mcp),
  [unity-mcp](https://github.com/CoplayDev/unity-mcp),
  [unreal-agent-harness](https://github.com/per-simmons/unreal-agent-harness),
  [Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios)
