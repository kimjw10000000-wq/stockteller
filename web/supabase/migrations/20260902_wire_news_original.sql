-- RSS English original kept beside the Korean Groq translation.
alter table public.wire_news
  add column if not exists original_title text;

alter table public.wire_news
  add column if not exists original_teaser text;

alter table public.wire_news
  add column if not exists original_summary text;

comment on column public.wire_news.original_title is
  'RSS/source headline before Korean translation';
comment on column public.wire_news.original_teaser is
  'RSS/source teaser before Korean translation';
comment on column public.wire_news.original_summary is
  'RSS/source body before Korean translation';

-- Existing GlobeNewswire rows were stored in English in title/teaser/summary.
update public.wire_news
set
  original_title = coalesce(original_title, title),
  original_teaser = coalesce(original_teaser, teaser),
  original_summary = coalesce(original_summary, summary)
where source = 'globenewswire'
  and original_title is null;
