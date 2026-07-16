/**
 * Data Chat — scoped analytics assistant.
 *
 * Layer map (context engineering):
 * - scopes.ts   → session locks + permission gates (what may load)
 * - tool-defs.ts → minimal model-facing tool schemas
 * - tools.ts     → trimmed JSON from existing metric libs (cold evidence → warm payload)
 * - prompt.ts    → hot runtime policy (no KPI formula dump)
 * - run.ts       → Anthropic tool loop
 *
 * Product docs: docs/DATA_CHAT.md · KPI truth: docs/KPIS.md
 */

export {
  DATA_CHAT_SCOPES,
  TOOLS_BY_SCOPE,
  canAccessScope,
  listAccessibleScopes,
  type ChatMessage,
  type DataChatFilters,
  type DataChatScope,
  type DataChatScopeDef,
} from './scopes';

export { runDataChat } from './run';
