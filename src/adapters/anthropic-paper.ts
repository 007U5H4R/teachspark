import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { GenerationRefusedError, type PaperJson, type PaperQcReport } from '../domain/types.js';
import type { PaperGenerator, PaperGenInput } from '../ports.js';
import { PAPER_SYSTEM_PROMPT, PaperJsonZ, PaperQcZ, buildPaperUserContent, buildQcUserContent } from '../bot/paper/prompts.js';

export interface AnthropicPaperGeneratorOptions {
  apiKey: string;
  model: string;      // PAPER_MODEL, default "claude-sonnet-5"
  timeoutMs?: number; // paper generation runs 1–4 min with 10 images
  maxRetries?: number;
  client?: Anthropic; // injectable for tests
}

export class AnthropicPaperGenerator implements PaperGenerator {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: AnthropicPaperGeneratorOptions) {
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs ?? 480_000, maxRetries: opts.maxRetries ?? 1 });
    this.model = opts.model;
  }

  async generatePaper(input: PaperGenInput) {
    const started = Date.now();
    // Structured outputs (GA, no beta): schema-validated JSON from output_config.format.
    // Sonnet 5 thinks adaptively by default — omit `thinking`; never send temperature/top_p/top_k.
    const res = await this.client.messages.parse({
      model: this.model,
      max_tokens: 30_000,
      system: PAPER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPaperUserContent(input) }],
      output_config: { format: zodOutputFormat(PaperJsonZ), effort: 'medium' },
    });
    if (res.stop_reason === 'refusal') throw new GenerationRefusedError(`paper generation refused (request ${res._request_id ?? '?'})`);
    if (!res.parsed_output) throw new Error(`paper generation returned no parseable output (stop ${res.stop_reason}, request ${res._request_id ?? '?'})`);
    return {
      paper: res.parsed_output as PaperJson,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      latencyMs: Date.now() - started,
      model: res.model,
    };
  }

  async qcPaper(paper: PaperJson, input: PaperGenInput): Promise<PaperQcReport> {
    const res = await this.client.messages.parse({
      model: this.model,
      max_tokens: 30_000,
      system: PAPER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildQcUserContent(paper, input) }],
      output_config: { format: zodOutputFormat(PaperQcZ), effort: 'low' },
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) {
      // QC must never block delivery — treat an unusable QC response as a pass with a note.
      return { pass: true, issues: ['qc_unavailable'], fixedPaper: null };
    }
    return res.parsed_output as PaperQcReport;
  }
}
