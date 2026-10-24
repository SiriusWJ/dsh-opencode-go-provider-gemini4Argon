/**
 * Protocol smoke test for dsh-opencode-go.
 *
 * Exercises the exact stack the plugin uses:
 *   @earendil-works/pi-ai google-generative-ai adapter
 *   + withOpenCodeSessionHeader (x-opencode-session)
 *   => OpenCode Go /inference/go/v1 (native Gemini protocol)
 *
 * Expects a real OpenCode API key. A key without an active Go subscription is
 * still useful: the request should reach model routing and come back as the
 * gateway's 403 "active OpenCode Go subscription is required" instead of a
 * transport, URL or session-header failure.
 */
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy'
import { withOpenCodeSessionHeader } from '@earendil-works/pi-ai/providers/opencode-headers'

const apiKey = process.env.OPENCODE_API_KEY
if (!apiKey) {
  console.error('OPENCODE_API_KEY is not set')
  process.exit(2)
}

const model = {
  id: 'gemini-4-argon',
  name: 'Gemini 4 Argon',
  api: 'google-generative-ai',
  provider: 'opencode-go',
  baseUrl: 'https://opencode.ai/inference/go/v1',
  reasoning: true,
  input: ['text', 'image'],
  cost: { input: 4, output: 20, cacheRead: 0, cacheWrite: 0, total: 0 },
  contextWindow: 1048576,
  maxTokens: 65536,
  thinkingLevelMap: {
    off: null,
    minimal: null,
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: null,
    max: null,
  },
}

const api = withOpenCodeSessionHeader(googleGenerativeAIApi())

const events = []
let text = ''
let failure
try {
  const stream = api.stream(
    model,
    {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly: OK' }] }],
      tools: [],
    },
    {
      apiKey,
      sessionId: 'dsh-opencode-go-smoke-test',
      maxTokens: 256,
      thinking: { enabled: true, level: 'low' },
    }
  )
  for await (const event of stream) {
    events.push(event.type)
    if (event.type === 'text_delta') text += event.delta
    if (event.type === 'thinking_delta') text += `[thinking] ${event.delta}`
    if (event.type === 'error') failure = event.error
    if (event.type === 'done') {
      console.log('done message:', JSON.stringify({ stopReason: event.message.stopReason, usage: event.message.usage }))
    }
  }
} catch (error) {
  failure = error
}

console.log('events:', [...new Set(events)].join(','))
console.log('text:', text.slice(0, 400))
if (failure) {
  const message = failure instanceof Error ? failure.message : JSON.stringify(failure)
  console.log('failure:', message.slice(0, 600))
  process.exitCode = 1
}
