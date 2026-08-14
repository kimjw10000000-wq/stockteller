-- Classify NYSE/NASDAQ issuers as DOMESTIC vs FOREIGN from SEC submissions metadata
alter table public.us_listed_companies
  add column if not exists issuer_type text;

alter table public.us_listed_companies
  drop constraint if exists us_listed_companies_issuer_type_check;

alter table public.us_listed_companies
  add constraint us_listed_companies_issuer_type_check
  check (issuer_type is null or issuer_type in ('DOMESTIC', 'FOREIGN'));

create index if not exists us_listed_companies_issuer_type_idx
  on public.us_listed_companies (issuer_type);

comment on column public.us_listed_companies.issuer_type is
  'SEC submissions metadata: US state of incorporation → DOMESTIC; foreign country / 20-F / ADR → FOREIGN';
