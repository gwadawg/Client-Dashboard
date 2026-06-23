-- Knowledge capture metadata for ad_library → Wm-os bridge (v2).
alter table ad_library
  add column if not exists knowledge_capture_status text not null default 'none',
  add column if not exists captured_at timestamptz,
  add column if not exists os_refs text[] not null default '{}';

alter table ad_library drop constraint if exists ad_library_knowledge_capture_status_check;
alter table ad_library add constraint ad_library_knowledge_capture_status_check check (
  knowledge_capture_status in ('none', 'pending', 'processed', 'needs_review', 'skipped')
);

create index if not exists ad_library_knowledge_capture_status_idx
  on ad_library (knowledge_capture_status, updated_at desc);

create or replace view v_ad_library_intelligence as
select
  al.*,
  coalesce(
    (
      select json_agg(json_build_object('id', ala.id, 'alias_name', ala.alias_name))
      from ad_library_aliases ala
      where ala.library_id = al.id
    ),
    '[]'::json
  ) as aliases
from ad_library al;

grant select on v_ad_library_intelligence to service_role;
grant select on v_ad_library_intelligence to authenticated;
