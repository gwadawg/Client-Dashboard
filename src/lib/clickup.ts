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

export async function setClickUpCustomField(
  taskId: string,
  fieldId: string,
  token: string,
  value: string | number,
): Promise<void> {
  const res = await fetch(
    `${CLICKUP_API}/task/${encodeURIComponent(taskId)}/field/${encodeURIComponent(fieldId)}`,
    {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickUp custom field ${fieldId} ${res.status}: ${text}`);
  }
}

/** Parse CLICKUP_OB_FIELD_MAP JSON: { "nmls": "field_uuid", ... } */
export function parseClickUpObFieldMap(): Record<string, string> {
  const raw = process.env.CLICKUP_OB_FIELD_MAP?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    console.error('[clickup] invalid CLICKUP_OB_FIELD_MAP JSON');
    return {};
  }
}

export function fmtMoney(n: number | null | undefined): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return 'n/a';
  return `$${n.toLocaleString('en-US')}`;
}
