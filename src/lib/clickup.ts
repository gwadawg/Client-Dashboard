export const CLICKUP_API = 'https://api.clickup.com/api/v2';

export const DEFAULT_CLIENT_HUB_LIST_ID = '901314164414';

export type CreateClickUpTaskInput = {
  name: string;
  description?: string;
  /** Unix timestamp in milliseconds */
  due_date?: number;
  status?: string;
};

export type ClickUpTaskResult = {
  id: string;
  url?: string;
  name?: string;
};

export function getClickUpToken(): string | undefined {
  return process.env.CLICKUP_API_TOKEN;
}

export function getClientHubListId(): string {
  return process.env.CLICKUP_CLIENT_HUB_LIST_ID ?? DEFAULT_CLIENT_HUB_LIST_ID;
}

export async function createClickUpTask(
  listId: string,
  token: string,
  input: CreateClickUpTaskInput,
): Promise<ClickUpTaskResult> {
  const body: Record<string, unknown> = {
    name: input.name,
    description: input.description,
  };
  if (input.due_date != null && !Number.isNaN(input.due_date)) {
    body.due_date = input.due_date;
  }
  if (input.status) body.status = input.status;

  const res = await fetch(`${CLICKUP_API}/list/${listId}/task`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickUp ${res.status}: ${text}`);
  }
  return res.json() as Promise<ClickUpTaskResult>;
}

export function clickUpTaskUrl(taskId: string): string {
  return `https://app.clickup.com/t/${taskId}`;
}

export async function addClickUpTaskComment(
  taskId: string,
  token: string,
  commentText: string,
): Promise<void> {
  const res = await fetch(`${CLICKUP_API}/task/${encodeURIComponent(taskId)}/comment`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment_text: commentText, notify_all: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickUp comment ${res.status}: ${text}`);
  }
}

export async function updateClickUpTask(
  taskId: string,
  token: string,
  updates: { status?: string; description?: string },
): Promise<void> {
  const body: Record<string, string> = {};
  if (updates.status) body.status = updates.status;
  if (updates.description) body.description = updates.description;
  if (!Object.keys(body).length) return;

  const res = await fetch(`${CLICKUP_API}/task/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickUp update task ${res.status}: ${text}`);
  }
}

/** Write only the mapped keys that have a value. Unknown keys are skipped. */
export async function applyClickUpFieldMap(
  taskId: string,
  token: string,
  values: Record<string, string | null | undefined>,
  logPrefix: string,
): Promise<number> {
  const fieldMap = parseClickUpObFieldMap();
  let wrote = 0;
  for (const [key, field] of Object.entries(fieldMap)) {
    const val = values[key];
    if (val == null || val === '' || val === '—') continue;
    try {
      await setClickUpCustomField(taskId, field, token, val);
      wrote += 1;
    } catch (e) {
      console.error(`${logPrefix} ClickUp field ${key} failed`, e);
    }
  }
  return wrote;
}

export async function setClickUpCustomField(
  taskId: string,
  field: string | ClickUpFieldConfig,
  token: string,
  value: unknown,
): Promise<void> {
  const config = typeof field === 'string' ? { id: field, type: 'text' as const } : field;
  const res = await fetch(
    `${CLICKUP_API}/task/${encodeURIComponent(taskId)}/field/${encodeURIComponent(config.id)}`,
    {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildClickUpCustomFieldPayload(config, value)),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickUp custom field ${config.id} ${res.status}: ${text}`);
  }
}

export type ClickUpCustomFieldType =
  | 'text'
  | 'url'
  | 'email'
  | 'phone'
  | 'number'
  | 'dropdown'
  | 'date'
  | 'labels';

export type ClickUpFieldConfig = {
  id: string;
  type: ClickUpCustomFieldType;
  /** Dropdown/label display value → ClickUp option UUID. */
  options?: Record<string, string>;
};

function lookupClickUpOption(config: ClickUpFieldConfig, raw: unknown): string {
  const value = String(raw ?? '').trim();
  const option = config.options?.[value] ?? config.options?.[value.toLowerCase()];
  return option ?? value;
}

function buildClickUpCustomFieldPayload(
  config: ClickUpFieldConfig,
  raw: unknown,
): Record<string, unknown> {
  if (config.type === 'date') {
    const date =
      typeof raw === 'number'
        ? raw
        : raw instanceof Date
          ? raw.getTime()
          : Date.parse(String(raw ?? ''));
    return { value: date, value_options: { time: true } };
  }

  if (config.type === 'dropdown') {
    return { value: lookupClickUpOption(config, raw) };
  }

  if (config.type === 'labels') {
    const values = Array.isArray(raw) ? raw : [raw];
    return {
      value: values
        .map(v => lookupClickUpOption(config, v))
        .filter(Boolean),
    };
  }

  if (config.type === 'number') {
    return { value: typeof raw === 'number' ? raw : Number(String(raw ?? '').trim()) };
  }

  return { value: String(raw ?? '') };
}

/** Parse CLICKUP_OB_FIELD_MAP JSON.
 *
 * Legacy shape is still accepted:
 * { "nmls": "field_uuid" }
 *
 * Preferred typed shape:
 * { "ob_form": { "id": "field_uuid", "type": "dropdown", "options": { "Filled": "option_uuid" } } }
 */
export function parseClickUpObFieldMap(): Record<string, ClickUpFieldConfig> {
  const raw = process.env.CLICKUP_OB_FIELD_MAP?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, ClickUpFieldConfig> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.trim()) {
        out[k] = { id: v.trim(), type: 'text' };
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        const cfg = v as Record<string, unknown>;
        const id = typeof cfg.id === 'string' ? cfg.id.trim() : '';
        const type = typeof cfg.type === 'string' ? cfg.type.trim() : 'text';
        const options =
          cfg.options && typeof cfg.options === 'object' && !Array.isArray(cfg.options)
            ? Object.fromEntries(
                Object.entries(cfg.options as Record<string, unknown>)
                  .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
              )
            : undefined;
        if (id) {
          out[k] = {
            id,
            type: isClickUpCustomFieldType(type) ? type : 'text',
            ...(options ? { options } : {}),
          };
        }
      }
    }
    return out;
  } catch {
    console.error('[clickup] invalid CLICKUP_OB_FIELD_MAP JSON');
    return {};
  }
}

function isClickUpCustomFieldType(v: string): v is ClickUpCustomFieldType {
  return ['text', 'url', 'email', 'phone', 'number', 'dropdown', 'date', 'labels'].includes(v);
}

export function fmtMoney(n: number | null | undefined): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return 'n/a';
  return `$${n.toLocaleString('en-US')}`;
}
