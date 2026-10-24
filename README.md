# dsh-opencode-go-provider-gemini4Argon

只给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）补充**一个模型**：OpenCode Go 的 **Gemini 4 Argon**。

dsh 自带的 `@deepseek-ai/dsh-llm-pi-ai` 适配器只暴露三种协议：`openai-completions`、`openai-responses`、`anthropic-messages`。而 Gemini 4 Argon 走的是 **Google Generative AI 原生协议**（`/v1beta` 的 `:streamGenerateContent`），内置适配器接不了。本插件在同样的 `pi-ai` 引擎上补上 `google-generative-ai` 协议，并按 OpenCode Go 的要求注入 `x-opencode-session` 路由头。

## 自禁用检测

插件在挂载时通过 dsh 的 LLM seam 探测：**是否已有其它已注册路由的模型列表里包含 `gemini-4-argon`**（即 dsh 自身或其它插件已经能提供这个模型）。

- 命中 → 插件**自动撤下**自己的路由与设置目录，只记一条日志，不执行也不会覆盖原生支持
- 未命中 → 正常运行

探测读取的是模型选择器同源的 `listModels` 接口，因此命中即代表用户在模型列表里已经能选到该模型。某条路由读取失败只会被跳过，不会被误判为"已支持"。检测在每次挂载时执行一次；dsh 升级加入原生支持后，下次启动自动让位。

## 功能

- 注册 `opencode-go-argon` 提供方路由，协议 `google-generative-ai`，只声明 `gemini-4-argon` 一个模型
- 支持流式输出、思考等级（low / medium / high）、图片输入、工具调用与 `thoughtSignature` 多轮回放
- 与内置 `llm-pi-ai` 适配器**共存**：路由名、设置命名空间、凭据记录域全部独立
- 除 Argon 外不添加任何其它模型（如需要 OpenCode Go 的其它模型，请直接用内置适配器的对应协议路由）

## 环境要求

| 项 | 版本 |
|---|---|
| DeepSeek Harness | `0.2.1-rc.2`（插件依赖的 dsh 包版本与之对齐） |
| Node.js | 22.19+ / 24+ |
| OpenCode | 有效的 **OpenCode Go / Go Plus 订阅**及 API key |

> 插件依赖 `@earendil-works/pi-ai@1.4.0`（该版本内置 OpenCode Go 的 Google 协议实现与 `x-opencode-session` 包装）。dsh 版本不同时，把 `package.json` 里的 `@deepseek-ai/*` 依赖改成与实际 dsh 版本一致的版本号。

## 安装

```bash
# 1) 安装插件运行时依赖（dsh 包 + pi-ai）
cd dsh-opencode-go-provider-gemini4Argon
npm install

# 2) 在 dsh 中安装本地 bundle（绝对路径）
#    plugin_manager install_bundle <本仓库绝对路径>
```

3. **重启 dsh**（或按插件管理器的提示重载）。

> npm 包名不允许大写字母，因此 `package.json` 里的 name 是小写
> `dsh-opencode-go-provider-gemini4argon`；GitHub 仓库与本地目录使用
> `dsh-opencode-go-provider-gemini4Argon`。

### 凭据

插件从 dsh 凭据服务读取 `OPENCODE_API_KEY`（Web 设置 → Models 页面写入，或环境变量）。`.credentials.yaml` 被 dsh 以 chokidar 监听，改完即时生效，无需重启。

## 配置

默认配置（见 `cordis.patch.yml`）：

```yaml
- insert:
    - id: opencode-go-gemini4-argon
      name: dsh-opencode-go-provider-gemini4argon
      config:
        providers:
          opencode-go-argon:
            displayName: OpenCode Go · Gemini 4 Argon
            apiKeyEnv: OPENCODE_API_KEY
            api: google-generative-ai
            baseURL: https://opencode.ai/inference/go/v1
            models:
              - id: gemini-4-argon
                name: Gemini 4 Argon
                contextWindow: 1048576
                maxTokens: 65536
                input: [text, image]
                reasoningEfforts:
                  low: low
                  medium: medium
                  high: high
```

路由 id `opencode-go-argon` 是模型选择器里的提供方名；想改配置时，在 profile 的 `cordis.patch.yml` 里用同样的 entry `id` 覆盖即可。

> `gemini-4-argon-contributor` 已被 OpenCode 官方废弃，请使用 `gemini-4-argon`。

## 验证 / 排错

```bash
curl -sS -N https://opencode.ai/inference/go/v1/models/gemini-4-argon:streamGenerateContent?alt=sse \
  -H "content-type: application/json" \
  -H "x-goog-api-key: $OPENCODE_API_KEY" \
  -H "x-opencode-session: my-agent/1.0" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Reply with exactly: OK"}]}]}'
```

插件同依赖栈的冒烟测试：

```bash
OPENCODE_API_KEY=... node test/protocol.mjs
```

| 现象 | 原因 |
|---|---|
| 403 `An active OpenCode Go subscription is required` | key 有效但账号没有 Go 订阅（或订阅未生效） |
| 401 `api_key_expired` / `Invalid credential` | key 过期或无效，到 OpenCode Console 重新生成 |
| 400 `MissingSessionID` | 请求缺 `x-opencode-session`；本插件按会话 id 自动注入 |
| 模型/提供方不可见 | 检查插件是否因自禁用检测退出（看日志中的 "already serves" 行），或设置页面拿到旧快照（刷新页面） |

## 工作原理

- 基于 `@deepseek-ai/dsh-llm-pi-ai` 的适配器实现（MIT），保留其凭据、重试、图片、replay 等全部机制
- 在协议表 `PROTOCOLS` 中新增 `google-generative-ai`，复用 `@earendil-works/pi-ai` 的官方 Google 适配器
- 用 `withOpenCodeSessionHeader` 包装该协议，把 dsh 传入的 `sessionId` 转成 `x-opencode-session`
- 协议表同时驱动配置 schema，因此 `api: google-generative-ai` 可被正常校验
- 挂载后调用 `ctx.llm.listProviders()` / `ctx.llm.listModels()` 做自禁用探测，命中则撤销注册
- 配置目录只声明本插件自己的路由，避免与内置适配器的 catalog 目录重复声明

## License

MIT。原始适配器版权归 DeepSeek；本插件的协议扩展与 OpenCode Go 路由由 SiriusWJ 维护。
