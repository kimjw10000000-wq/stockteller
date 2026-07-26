-- Compliance watchlist APPEND (기존 행 유지, 신규만 upsert)
-- FFAI 등 기존 시드는 삭제하지 않음

insert into public.stocks (name, ticker, market)
values
  -- image 1
  ('Smartbird Inc', 'BIRD', 'us'),
  ('BioVie Inc', 'BIVI', 'us'),
  ('Bluejay Diagnostics Inc', 'BJDX', 'us'),
  ('Bio-Key International Inc', 'BKYI', 'us'),
  ('Bridgeline Digital Inc', 'BLIN', 'us'),
  ('Beeline Holdings Inc', 'BLNE', 'us'),
  ('Biomerica Inc', 'BMRA', 'us'),
  ('Bionano Genomics Inc', 'BNGO', 'us'),
  ('Bonk Inc', 'BNKK', 'us'),
  ('Banzai International Inc', 'BNZI', 'us'),
  ('Bolt Biotherapeutics Inc', 'BOLT', 'us'),
  ('Boxlight Corp', 'BOXL', 'us'),
  ('Barfresh Food Group Inc', 'BRFH', 'us'),
  ('Barnwell Industries Inc', 'BRN', 'us'),
  ('BioRestorative Therapies Inc', 'BRTX', 'us'),
  ('BioXcel Therapeutics Inc', 'BTAI', 'us'),
  ('BT Brands Inc', 'BTBD', 'us'),
  ('BTCS Inc', 'BTCS', 'us'),
  ('Armlogi Holding Corp', 'BTOC', 'us'),
  ('BOXABL Inc', 'BXBL', 'us'),
  -- image 2 (FFAI는 기존 시드에 있음 — 이름만 동기화)
  ('Estrella Immunopharma Inc', 'ESLA', 'us'),
  ('eXoZymes Inc', 'EXOZ', 'us'),
  ('Exyn Technologies Inc', 'EXYN', 'us'),
  ('Reliance Global Group Inc', 'EZRA', 'us'),
  ('Fabric.AI Inc', 'FABC', 'us'),
  ('FBS Global Ltd', 'FBGL', 'us'),
  ('FibroBiologics Inc', 'FBLG', 'us'),
  ('Focus Universal Inc', 'FCUV', 'us'),
  ('5E Advanced Materials Inc', 'FEAM', 'us'),
  ('ENvue Medical Inc', 'FEED', 'us'),
  ('Femasys Inc', 'FEMY', 'us'),
  ('Faraday Future Intelligent Electric Inc.', 'FFAI', 'us'),
  ('FGI Industries Ltd', 'FGI', 'us'),
  ('FG Nexus Inc', 'FGNX', 'us'),
  ('Franklin Wireless Corp', 'FKWL', 'us'),
  ('Fold Holdings Inc', 'FLD', 'us'),
  ('Filana Therapeutics Inc', 'FLNA', 'us'),
  ('Flux Power Holdings Inc', 'FLUX', 'us'),
  ('Fly-E Group Inc', 'FLYE', 'us'),
  ('Kandal M Venture Ltd', 'FMFC', 'us')
on conflict (ticker) do update
set
  name = excluded.name,
  market = excluded.market;
