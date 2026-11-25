CREATE TABLE commune (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
) STRICT;

CREATE TABLE mutation (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  nature TEXT NOT NULL,
  amount_cents INTEGER
  -- Multiple parcels or communes can share the full mutation amount.
) STRICT;

CREATE TABLE dvf_row (
  source_year INTEGER NOT NULL,
  source_line INTEGER NOT NULL,
  mutation_id TEXT NOT NULL REFERENCES mutation(id),
  commune_code TEXT NOT NULL REFERENCES commune(code),
  disposition TEXT NOT NULL,
  parcel_id TEXT,
  property_type TEXT,
  built_area REAL,
  land_area REAL,
  rooms INTEGER,
  longitude REAL,
  latitude REAL,
  PRIMARY KEY (source_year, source_line)
) STRICT;

CREATE INDEX dvf_row_commune_mutation ON dvf_row (commune_code, mutation_id);
CREATE INDEX dvf_row_mutation ON dvf_row (mutation_id);
CREATE INDEX mutation_date ON mutation (date);

CREATE TABLE filosofi (
  iris TEXT PRIMARY KEY,
  commune_code TEXT NOT NULL REFERENCES commune(code),
  median_income REAL,
  poverty_rate REAL,
  income_d9 REAL,
  interdecile_ratio REAL
) STRICT;

CREATE TABLE bdnb_building (
  id TEXT PRIMARY KEY,
  commune_code TEXT NOT NULL REFERENCES commune(code),
  iris TEXT
) STRICT;

CREATE INDEX bdnb_building_commune ON bdnb_building (commune_code);

CREATE TABLE source (
  dataset TEXT NOT NULL,
  name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  rows_loaded INTEGER NOT NULL,
  PRIMARY KEY (dataset, name)
) STRICT;

CREATE TABLE coverage (
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL
) STRICT;
