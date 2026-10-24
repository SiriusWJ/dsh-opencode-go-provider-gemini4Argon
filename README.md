# dsh-opencode-go

把 **OpenCode Go** 的模型接入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的 host 插件，重点是 **Gemini 4 Argon**。

dsh 自带的 `@deepseek-ai/dsh-llm-pi-ai` 适配器只暴露三种协议：`openai-completions`、`openai-responses`、`anthropic-messages`。而 OpenCode Go 的 Gemini 4 Argon 走的是 **Google Generative AI 原生协议**（`/v1beta` 的 `:streamGenerateContent`），因此内置适配器无法接入。本插件在同样的 `pi-ai` 引擎上补上了 `google-generative-ai` 协议，并按 OpenCode Go 的要求注入 `x-opencode-session` 路由头。

## 功能

- 注册一个 `opencode-go-argon` 提供方路由，协议为 `google-generative-ai`
- 支持 Gemini 4 Argon 的流式输出、思考等级（low / medium / high）、工具调用与 `thoughtSignature` 多轮回放
- 与内置 `llm-pi-ai` 适配器**共存**：插件使用独立的路由名、设置命名空间与凭据记录域，不影响现有的 OpenCode Zen / Ollama 等提供方
- 除 Argon 外，OpenCode Go 的其它模型也可以按同样方式加入（见"添加其它模型"）

## 环境要求

| 项 | 版本 |
|---|---|
| DeepSeek Harness | `0.2.1-rc.2`（插件依赖的 dsh 包版本与之对齐） |
| Node.js | 22.19+ / 24+ |
| OpenCode | 有效的 **OpenCode Go / Go Plus 订阅**及 API key |

> 插件依赖 `@earendil-works/pi-ai@1.4.0`（该版本内置 OpenCode Go 的 Google 协议实现与 `x-opencode-session` 包装）。dsh 版本不同时，请把 `package.json` 里的 `@deepseek-ai/*` 依赖改成与实际 dsh 版本一致的版本号。

## 安装

```bash
# 1) 安装插件自己的运行时依赖（dsh 包 + pi-ai）
cd dsh-opencode-go
npm install

# 2) 在 dsh 中安装本地 bundle（绝对路径）
#    plugin_manager install_bundle <本仓库绝对路径>
```

3. **重启 dsh**，让插件在 host 进程中加载。

安装成功后：

- 模型选择器中出现提供方 **OpenCode Go · Gemini 4 Argon**
- 发送一条对话即可验证流式输出
- 触发一次工具调用可验证多轮工具链

### 凭据

插件从 dsh 凭据服务读取 `OPENCODE_API_KEY`（Web 设置 → Models 页面写入，或导出环境变量）。配置里不保存密钥。

## 配置

插件自带默认配置（见 `cordis.patch.yml`）：

```yaml
- insert:
    - id: opencode-go
      name: dsh-opencode-go
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

想改配置时，在 profile 的 `cordis.patch.yml` 里用同样的 `id: opencode-go` 覆盖即可。

### 添加其它模型

OpenCode Go 的模型端点与协议见 [官方文档](https://opencode.ai/v2/docs/console/go/)：

| 协议 | 端点前缀 | 常见模型 |
|---|---|---|
| `google-generative-ai` | `https://opencode.ai/inference/go/v1` | `gemini-4-argon` |
| `openai-completions` | `https://opencode.ai/inference/go/openai/v1` | `glm-5.3`、`kimi-k3`、`deepseek-v4-pro` 等 |
| `openai-responses` | `https://opencode.ai/inference/go/openai/v1` | `gpt-6-luna`、`grok-4.7` 等 |
| `anthropic-messages` | `https://opencode.ai/inference/go/anthropic` | `claude-haiku-5-5`、`qwen3.8-max` 等 |

> 不同协议需要独立的 provider 条目（`api` 是 provider 级字段）。`gemini-4-argon-contributor` 已被 OpenCode 废弃，请使用 `gemini-4-argon`。

## 验证 / 排错

不经过 dsh 的直接端点检查：

```bash
curl -sS -N https://opencode.ai/inference/go/v1/models/gemini-4-argon:streamGenerateContent?alt=sse \
  -H "content-type: application/json" \
  -H "x-goog-api-key: $OPENCODE_API_KEY" \
  -H "x-opencode-session: my-agent/1.0" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Reply with exactly: OK"}]}]}'
```

协议冒烟测试（使用插件同一套依赖）：

```bash
OPENCODE_API_KEY=... node test/protocol.mjs
```

常见错误：

| 现象 | 原因 |
|---|---|
| 403 `An active OpenCode Go subscription is required` | key 有效但账号没有 Go 订阅（或订阅未生效） |
| 400 `MissingSessionID` | 请求缺 `x-opencode-session`；本插件按会话 id 自动注入 |
| 401 `Invalid credential` / `api_key_expired` | key 无效或已过期，请到 OpenCode Console 重新生成 |
| 模型不可见 | OpenCode 模型目录会变化，默认只声明 `gemini-4-argon`；新模型手动加入 `models` |

## 工作原理

- 基于 `@deepseek-ai/dsh-llm-pi-ai` 的适配器实现（MIT），保留其凭据、重试、图片、replay 等全部机制
- 在协议表 `PROTOCOLS` 中新增 `google-generative-ai`，并复用 `@earendil-works/pi-ai` 的官方 Google 适配器
- 用 `withOpenCodeSessionHeader` 包装该协议，把 dsh 传入的 `sessionId` 转成 `x-opencode-session`
- 协议表同时驱动配置 schema，因此 `api: google-generative-ai` 可以被正常校验
- 配置目录只声明本插件自己的路由，避免与内置适配器的 catalog 目录重复声明

## License

MIT。原始适配器版权归 DeepSeek；本插件的协议扩展与 OpenCode Go 路由由 SiriusWJ 维护。
