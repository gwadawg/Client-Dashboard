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

export function fmtMoney(n: number | null | undefined): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return 'n/a';
  return `$${n.toLocaleString('en-US')}`;
}
