-- Page optimized is no longer tracked on the client record.
alter table clients drop column if exists page_optimized;
