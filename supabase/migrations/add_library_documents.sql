-- Native playbooks / SOPs stored in Supabase for in-app editing.
-- Viewing gated by 'resources' permission in app code; mutations admin/owner only.
create table if not exists library_documents (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  title           text not null,
  description     text,
  body            text not null,
  domain          text not null default 'acquisition',
  owner           text not null,
  status          text not null default 'draft',
  artifact_type   text not null,
  department      text,
  review_cycle    text,
  script_version  text,
  related_docs    jsonb not null default '[]',
  headings        jsonb not null default '[]',
  stage_nav       jsonb not null default '[]',
  opening_pills   jsonb not null default '[]',
  icp_pills       jsonb not null default '[]',
  featured        boolean not null default false,
  bundle          text,
  tags            text[] not null default '{}',
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint library_documents_owner_check check (
    owner in ('setter', 'closer', 'sales-leadership', 'operations')
  ),
  constraint library_documents_status_check check (
    status in ('active', 'draft')
  ),
  constraint library_documents_artifact_type_check check (
    artifact_type in ('script', 'sop', 'checklist', 'reference', 'framework', 'doctrine', 'prompt', 'hub', 'document')
  ),
  constraint library_documents_department_check check (
    department is null or department in ('sales', 'call-center', 'media-buying', 'client-success')
  )
);

create index if not exists library_documents_department_idx on library_documents(department);
create index if not exists library_documents_status_idx on library_documents(status);
create index if not exists library_documents_updated_at_idx on library_documents(updated_at desc);
create index if not exists library_documents_tags_idx on library_documents using gin(tags);
create index if not exists library_documents_search_idx on library_documents
  using gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(body, '')));

-- Form registry: metadata for internal forms (routes remain React pages).
create table if not exists form_registry (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  description text not null default '',
  href        text not null,
  audience    text not null default '',
  tags        text[] not null default '{}',
  sort_order  int not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists form_registry_sort_order_idx on form_registry(sort_order);
create index if not exists form_registry_tags_idx on form_registry using gin(tags);
