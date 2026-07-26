-- Compliance D-Day 검색 대상 20종목 시드 (stocks upsert)
-- Supabase SQL Editor에서 실행 가능

insert into public.stocks (name, ticker, market)
values
  ('Atlantic American Corp', 'AAME', 'us'),
  ('ABVC BioPharma Inc', 'ABVC', 'us'),
  ('ACCESS Newswire Inc', 'ACCS', 'us'),
  ('Aclarion Inc', 'ACON', 'us'),
  ('Actuate Therapeutics Inc', 'ACTU', 'us'),
  ('Acurx Pharmaceuticals Inc', 'ACXP', 'us'),
  ('Adagio Medical Holdings Inc', 'ADGM', 'us'),
  ('Adial Pharmaceuticals Inc', 'ADIL', 'us'),
  ('Alset Inc', 'AEI', 'us'),
  ('Aethlon Medical Inc', 'AEMD', 'us'),
  ('AEON Biopharma Inc', 'AEON', 'us'),
  ('Aimei Health Technology Co Ltd', 'AFJK', 'us'),
  ('Abundia Global Impact Group Inc', 'AGIG', 'us'),
  ('Ashford Hospitality Trust Inc', 'AHT', 'us'),
  ('20/20 Biolabs Inc', 'AIDX', 'us'),
  ('All InFutureTech Alliance Inc', 'AIFA', 'us'),
  ('Firefly Neuroscience Inc', 'AIFF', 'us'),
  ('AIM ImmunoTech Inc', 'AIM', 'us'),
  ('Ainos Inc', 'AIMD', 'us'),
  ('reAlpha Tech Corp', 'AIRE', 'us')
on conflict (ticker) do update
set
  name = excluded.name,
  market = excluded.market;
