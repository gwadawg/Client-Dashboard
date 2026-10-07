import { landingRepo, yamlPath } from "./products";

type GhResult<T> = { status: number; data: T };

function token(): string {
  const value = process.env.LANDING_GITHUB_TOKEN?.trim();
  if (!value) throw new Error("LANDING_GITHUB_TOKEN is not set");
  return value;
}

async function gh<T>(path: string, init?: RequestInit): Promise<GhResult<T>> {
  const res = await fetch(`https://api.github.com/repos/${landingRepo()}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data = {} as T;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = {} as T;
    }
  }
  return { status: res.status, data };
}

function repoOwner(): string {
  return landingRepo().split("/")[0] || "gwadawg";
}

export async function yamlExistsOnMain(slug: string): Promise<boolean> {
  const path = yamlPath(slug);
  const { status, data } = await gh<{ message?: string }>(
    `/contents/${path}?ref=main`,
  );
  if (status === 200) return true;
  if (status === 404) return false;
  const message = typeof data.message === "string" ? data.message : `GitHub ${status}`;
  throw new Error(message);
}

type RefData = { object?: { sha?: string }; message?: string };
type ContentData = { sha?: string; message?: string };
type PullData = {
  number?: number;
  html_url?: string;
  head?: { sha?: string };
  message?: string;
};

export type OpenedPull = {
  prUrl: string;
  prNumber: number;
  headSha: string;
};

async function branchSha(branch: string): Promise<string | null> {
  const { status, data } = await gh<RefData>(`/git/ref/heads/${branch}`);
  if (status === 404) return null;
  if (status !== 200 || !data.object?.sha) {
    throw new Error(data.message || `Could not read branch ${branch}`);
  }
  return data.object.sha;
}

async function ensureBranch(branch: string, mainSha: string): Promise<void> {
  const existing = await branchSha(branch);
  if (existing) return;
  const { status, data } = await gh<RefData>("/git/refs", {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainSha }),
  });
  if (status === 201 || status === 422) return;
  throw new Error(data.message || `Could not create branch ${branch}`);
}

async function putFile(branch: string, path: string, bytes: Buffer, message: string): Promise<void> {
  const current = await gh<ContentData>(`/contents/${path}?ref=${encodeURIComponent(branch)}`);
  const body: Record<string, string> = {
    message,
    content: bytes.toString("base64"),
    branch,
  };
  if (current.status === 200 && current.data.sha) body.sha = current.data.sha;
  const put = await gh<ContentData>(`/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (put.status !== 200 && put.status !== 201) {
    throw new Error(put.data.message || `Could not write ${path}`);
  }
}

export async function openLandingPull(input: {
  slug: string;
  files: { path: string; bytes: Buffer }[];
  title: string;
  body: string;
}): Promise<OpenedPull> {
  const main = await branchSha("main");
  if (!main) throw new Error("Could not read main");
  const branch = `landing/${input.slug}`;
  await ensureBranch(branch, main);
  const message = input.title;
  for (const file of input.files) {
    await putFile(branch, file.path, file.bytes, message);
  }
  const headSha = await branchSha(branch);
  if (!headSha) throw new Error("Branch disappeared after commit");

  const head = `${repoOwner()}:${branch}`;
  const existing = await gh<PullData[]>(
    `/pulls?head=${encodeURIComponent(head)}&state=open`,
  );
  const open = Array.isArray(existing.data) ? existing.data[0] : undefined;
  if (open?.number && open.html_url) {
    return { prUrl: open.html_url, prNumber: open.number, headSha };
  }

  const created = await gh<PullData>("/pulls", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      head: branch,
      base: "main",
      body: input.body,
    }),
  });
  if (!created.data.number || !created.data.html_url) {
    throw new Error(created.data.message || "Could not open the pull request");
  }
  return {
    prUrl: created.data.html_url,
    prNumber: created.data.number,
    headSha: created.data.head?.sha || headSha,
  };
}
