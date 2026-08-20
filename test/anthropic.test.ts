import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { AnthropicGenerator, buildMessageParams } from '../src/adapters/anthropic.js';
import { GenerationRefusedError } from '../src/domain/types.js';

const req = { skillId: 'worksheet' as const, topic: 'Comparing fractions', grade: 'Middle (Classes 6-8)', subject: 'Maths', board: 'CBSE' };

function fakeClient(message: Partial<Anthropic.Message>) {
  const create = vi.fn().mockResolvedValue({
    id: 'msg_1', model: 'claude-sonnet-5', stop_reason: 'end_turn', _request_id: 'req_1',
    content: [{ type: 'text', text: 'TITLE: T\n**LEVEL 1 - SUPPORT**\n1. q' }],
    usage: { input_tokens: 120, output_tokens: 340 },
    ...message,
  });
  return { client: { messages: { create } } as unknown as Anthropic, create };
}

describe('buildMessageParams', () => {
  it('uses adaptive thinking + low effort on Sonnet and never sends temperature', () => {
    const p = buildMessageParams('claude-sonnet-5', 'hello') as unknown as Record<string, unknown>;
    expect(p.model).toBe('claude-sonnet-5');
    expect(p.max_tokens).toBe(4096);
    expect(p.thinking).toEqual({ type: 'adaptive' });
    expect(p.output_config).toEqual({ effort: 'low' });
    expect(p).not.toHaveProperty('temperature');
    expect(typeof p.system).toBe('string');
  });
  it('omits thinking/effort on Haiku (unsupported there)', () => {
    const p = buildMessageParams('claude-haiku-4-5', 'hello') as unknown as Record<string, unknown>;
    expect(p).not.toHaveProperty('thinking');
    expect(p).not.toHaveProperty('output_config');
  });
});

describe('AnthropicGenerator.generate', () => {
  it('returns cleaned text, tokens, model, request id and the prompt used', async () => {
    const { client, create } = fakeClient({});
    const g = new AnthropicGenerator({ apiKey: 'k', model: 'claude-sonnet-5', client });
    const r = await g.generate(req);
    expect(r.text).toBe('TITLE: T\nLEVEL 1 - SUPPORT\n1. q');
    expect(r.model).toBe('claude-sonnet-5');
    expect(r.inputTokens).toBe(120);
    expect(r.outputTokens).toBe(340);
    expect(r.requestId).toBe('req_1');
    expect(r.promptUsed).toContain('Comparing fractions');
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    const params = create.mock.calls[0][0] as Record<string, unknown>;
    expect((params.messages as Array<{ content: string }>)[0].content).toContain('LEVEL 3 - CHALLENGE');
  });
  it('throws GenerationRefusedError on stop_reason refusal', async () => {
    const { client } = fakeClient({ stop_reason: 'refusal', content: [] });
    const g = new AnthropicGenerator({ apiKey: 'k', model: 'claude-sonnet-5', client });
    await expect(g.generate(req)).rejects.toBeInstanceOf(GenerationRefusedError);
  });
  it('throws a plain Error when the model returns no text', async () => {
    const { client } = fakeClient({ content: [] });
    const g = new AnthropicGenerator({ apiKey: 'k', model: 'claude-sonnet-5', client });
    await expect(g.generate(req)).rejects.toThrow(/empty/);
  });
});
