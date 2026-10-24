/**
 * Unit tests for the self-disabling probe.
 *
 * `harnessAlreadyServesModel(ctx)` must return the id of a *foreign* route that
 * already lists gemini-4-argon, and must ignore this plugin's own route.
 */
import { harnessAlreadyServesModel } from '../lib/index.js'

const cases = [
  {
    name: 'native route serves the model',
    ctx: { llm: { listProviders: () => [{ id: 'opencode-go' }], listModels: async () => [{ id: 'gemini-4-argon' }] } },
    expected: 'opencode-go',
  },
  {
    name: 'own route is ignored',
    ctx: { llm: { listProviders: () => [{ id: 'opencode-go-argon' }], listModels: async () => [{ id: 'gemini-4-argon' }] } },
    expected: undefined,
  },
  {
    name: 'other models do not count',
    ctx: { llm: { listProviders: () => [{ id: 'opencode-go' }], listModels: async () => [{ id: 'glm-5.3' }] } },
    expected: undefined,
  },
  {
    name: 'unreadable route is skipped, readable one wins',
    ctx: {
      llm: {
        listProviders: () => [{ id: 'broken' }, { id: 'ok' }],
        listModels: async (id) => {
          if (id === 'broken') throw new Error('no adapter')
          return [{ id: 'gemini-4-argon' }]
        },
      },
    },
    expected: 'ok',
  },
  {
    name: 'no llm service',
    ctx: { llm: { listProviders: () => { throw new Error('missing') } } },
    expected: undefined,
  },
  {
    name: 'empty provider list',
    ctx: { llm: { listProviders: () => [] } },
    expected: undefined,
  },
]

let failed = 0
for (const testCase of cases) {
  const actual = await harnessAlreadyServesModel(testCase.ctx)
  const ok = actual === testCase.expected
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${testCase.name} -> ${String(actual)}`)
  if (!ok) failed += 1
}
console.log(failed === 0 ? 'all detection cases passed' : `${failed} case(s) failed`)
process.exitCode = failed === 0 ? 0 : 1
