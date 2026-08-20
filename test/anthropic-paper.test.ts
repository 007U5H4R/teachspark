import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { AnthropicPaperGenerator } from '../src/adapters/anthropic-paper.js';
import { buildQcUserContent } from '../src/bot/paper/prompts.js';
import { GenerationRefusedError } from '../src/domain/types.js';
import { samplePaperJson } from '../src/adapters/memory.js';
import type { PaperGenInput } from '../src/ports.js';

const input: PaperGenInput = {
  request: { subject: 'Hindi', language: 'Hindi', grade: 'g', board: 'b', chapter: 'c', assessmentType: 'worksheet', tiers: ['A'], teacherVersion: true, media: [], adjustment: null },
  profile: { grade: 'g', subject: 'Hindi', board: 'b' },
  media: [{ data: Buffer.from('img'), contentType: 'image/jpeg' }],
};

function fakeClient(over: Record<string, unknown> = {}) {
  const parse = vi.fn().mockResolvedValue({
    stop_reason: 'end_turn',
    parsed_output: samplePaperJson(),
    model: 'claude-sonnet-5',
    usage: { input_tokens: 9000, output_tokens: 5000 },
    _request_id: 'req_1',
    ...over,
  });
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}

describe('AnthropicPaperGenerator.generatePaper', () => {
  it('returns the parsed paper with usage and never sends temperature', async () => {
    const { client, parse } = fakeClient();
    const g = new AnthropicPaperGenerator({ apiKey: 'k', model: 'claude-sonnet-5', client });
    const r = await g.generatePaper(input);
    expect(r.paper.title).toContain('टोपी');
    expect(r.inputTokens).toBe(9000);
    expect(r.outputTokens).toBe(5000);
    const params = parse.mock.calls[0][0] as Record<string, unknown>;
    expect(params.model).toBe('claude-sonnet-5');
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('thinking'); // omitted = adaptive (Sonnet 5 default)
    expect((params.output_config as Record<string, unknown>).format).toBeDefined();
    expect((params.output_config as Record<string, unknown>).effort).toBe('medium');
    const content = (params.messages as Array<{ content: unknown[] }>)[0].content;
    expect((content[0] as { type: string }).type).toBe('image'); // media first
  });
  it('throws GenerationRefusedError on stop_reason refusal', async () => {
    const { client } = fakeClient({ stop_reason: 'refusal', parsed_output: null });
    const g = new AnthropicPaperGenerator({ apiKey: 'k', model: 'claude-sonnet-5', client });
    await expect(g.generatePaper(input)).rejects.toBeInstanceOf(GenerationRefusedError);
  });
  it('throws when parsing failed (parsed_output null)', async () => {
    const { client } = fakeClient({ parsed_output: null });
    const g = new AnthropicPaperGenerator({ apiKey: 'k', model: 'claude-sonnet-5', client });
    await expect(g.generatePaper(input)).rejects.toThrow(/parse/i);
  });
});

describe('AnthropicPaperGenerator.qcPaper', () => {
  it('returns the QC verdict and runs at effort low', async () => {
    const { client, parse } = fakeClient({ parsed_output: { pass: false, issues: ['Tier A Q3 leaks the answer'], fixedPaper: samplePaperJson() } });
    const g = new AnthropicPaperGenerator({ apiKey: 'k', model: 'claude-sonnet-5', client });
    const qc = await g.qcPaper(samplePaperJson(), input);
    expect(qc.pass).toBe(false);
    expect(qc.issues[0]).toContain('Q3');
    expect(qc.fixedPaper).not.toBeNull();
    const params = parse.mock.calls[0][0] as Record<string, unknown>;
    expect((params.output_config as Record<string, unknown>).effort).toBe('low');
    // Pin the wiring: the content actually SENT to the client is buildQcUserContent's output,
    // not some inline/duplicated construction that could silently drift from it.
    const content = (params.messages as Array<{ content: unknown[] }>)[0].content;
    expect(content).toEqual(buildQcUserContent(samplePaperJson(), input));
  });
  it('degrades to a pass-with-note when QC output is unusable (never blocks delivery)', async () => {
    const { client } = fakeClient({ parsed_output: null });
    const g = new AnthropicPaperGenerator({ apiKey: 'k', model: 'claude-sonnet-5', client });
    const qc = await g.qcPaper(samplePaperJson(), input);
    expect(qc.pass).toBe(true);
    expect(qc.issues).toEqual(['qc_unavailable']);
  });
});
