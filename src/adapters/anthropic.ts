import Anthropic from '@anthropic-ai/sdk';
import { GenerationRefusedError, type GenerationRequest, type GenerationResult } from '../domain/types.js';
import type { Generator } from '../ports.js';
import { GENERATION_SYSTEM_PROMPT, SKILLS } from '../bot/skills.js';
import { cleanModelText } from '../bot/postprocess.js';

export interface AnthropicGeneratorOptions {
  apiKey: string;
  model: string; // e.g. "claude-sonnet-5" (default) or "claude-haiku-4-5"
  timeoutMs?: number; // SDK timeout is in MILLISECONDS
  maxRetries?: number;
  client?: Anthropic; // injectable for tests
}

/** Haiku 4.5 supports neither adaptive thinking nor output_config.effort. Sonnet 5 thinks by default, so cap it at effort 'low'. */
function supportsAdaptiveEffort(model: string): boolean {
  return !model.startsWith('claude-haiku');
}

export function buildMessageParams(model: string, userPrompt: string): Anthropic.MessageCreateParamsNonStreaming {
  const base: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 4096,
    system: GENERATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  };
  // Never send temperature/top_p/top_k (400 on Sonnet 5).
  return supportsAdaptiveEffort(model)
    ? ({ ...base, thinking: { type: 'adaptive' }, output_config: { effort: 'low' } } as Anthropic.MessageCreateParamsNonStreaming)
    : base;
}

export class AnthropicGenerator implements Generator {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: AnthropicGeneratorOptions) {
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs ?? 60_000, maxRetries: opts.maxRetries ?? 2 });
    this.model = opts.model;
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const skill = SKILLS[req.skillId];
    const promptUsed = skill.userPrompt(req, req.topic);
    const started = Date.now();
    const message = await this.client.messages.create(buildMessageParams(this.model, promptUsed));
    const latencyMs = Date.now() - started;
    const requestId = message._request_id ?? null;

    if (message.stop_reason === 'refusal') {
      throw new GenerationRefusedError(`model refused (request ${requestId ?? '?'})`);
    }
    const text = cleanModelText(
      message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n'),
    );
    if (text.length === 0) throw new Error(`empty model output (request ${requestId ?? '?'})`);
    if (message.stop_reason === 'max_tokens') {
      console.warn(`[anthropic] output truncated at max_tokens (request ${requestId ?? '?'})`);
    }
    return {
      text,
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      latencyMs,
      requestId,
      promptUsed,
    };
  }
}
