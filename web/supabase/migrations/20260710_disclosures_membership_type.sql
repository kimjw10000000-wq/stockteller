alter table public.disclosures
  add column if not exists membership_type text not null default 'free';

alter table public.disclosures
  drop constraint if exists disclosures_membership_type_check;

alter table public.disclosures
  add constraint disclosures_membership_type_check check (
    membership_type in ('free', 'premium')
  );

create index if not exists disclosures_membership_type_idx
  on public.disclosures (membership_type);
