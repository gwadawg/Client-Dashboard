import Anthropic from '@anthropic-ai/sdk';
import type { AuthContext } from '../../api-auth';
import { buildSystemPrompt } from './prompt';
import type { ChatMessage, DataChatFilters, DataChatScope } from './scopes';
import { toolDefsForScope } from './tool-defs';
import { executeDataChatTool } from './tools';

const MAX_TOOL_ROUNDS = 4;

export async function runDataChat(opts: {
  ctx: AuthContext;
  scope: DataChatScope;
  filters: DataChatFilters;
  messages: ChatMessage[];
}): Promise<{ reply: string; toolsUsed: string[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local to enable Data Chat.');
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
  const tools = toolDefsForScope(opts.scope);
  const toolsUsed: string[] = [];

  const anthropicMessages: Anthropic.MessageParam[] = opts.messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model,
      max_tokens: 1600,
      system: buildSystemPrompt(opts.scope, opts.filters),
      tools,
      messages: anthropicMessages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
      return { reply: text || 'No response generated.', toolsUsed };
    }

    if (response.stop_reason !== 'tool_use') {
      return { reply: text || 'No response generated.', toolsUsed };
    }

    anthropicMessages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      toolsUsed.push(block.name);
      try {
        const result = await executeDataChatTool(
          opts.ctx,
          opts.scope,
          block.name,
          (block.input ?? {}) as Record<string, unknown>,
          opts.filters,
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          is_error: true,
          content: err instanceof Error ? err.message : 'Tool failed',
        });
      }
    }

    anthropicMessages.push({ role: 'user', content: toolResults });
  }

  return {
    reply:
      'I hit the tool-call limit for this question. Try a narrower ask (one client or one metric).',
    toolsUsed,
  };
}
