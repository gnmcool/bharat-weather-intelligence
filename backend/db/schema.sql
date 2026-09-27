-- Bharat Weather Intelligence — PostgreSQL 14+ / PostGIS 3 schema
-- Every stored number carries provenance: source, model, issue_time, valid_time, variable, unit.
-- Apply:  psql "$BWI_DATABASE_URL" -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS postgis;

-- ------------------------------------------------------------------------
-- Administrative hierarchy: India → State → District → Taluka → Village
-- (level 0..4). lgd_code = Local Government Directory code when known.
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_unit (
    id           text PRIMARY KEY,                 -- e.g. IN, IN-24, IN-24-474
    level        smallint NOT NULL CHECK (level BETWEEN 0 AND 4),
    name         text NOT NULL,
    parent_id    text REFERENCES admin_unit(id),
    lgd_code     text,
    census_code  text,
    geom         geometry(MultiPolygon, 4326),
    centroid     geometry(Point, 4326),
    area_km2     double precision,
    boundary_source text NOT NULL,                 -- provenance of the polygon
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_unit_geom_gix ON admin_unit USING gist (geom);
CREATE INDEX IF NOT EXISTS admin_unit_parent_ix ON admin_unit (parent_id);
CREATE INDEX IF NOT EXISTS admin_unit_level_name_ix ON admin_unit (level, lower(name));

-- ------------------------------------------------------------------------
-- Data sources and model runs
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_source (
    id       text PRIMARY KEY,     -- imd, gfs_e2s, openmeteo, nasa_power, sachet, mosdac, e2s_ai_fcn
    name     text NOT NULL,
    kind     text NOT NULL CHECK (kind IN ('observation','forecast','analysis','climatology','satellite','warning','advisory')),
    licence  text,
    url      text,
    official boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS forecast_run (
    id           bigserial PRIMARY KEY,
    source_id    text NOT NULL REFERENCES data_source(id),
    model        text NOT NULL,
    issue_time   timestamptz NOT NULL,
    retrieved_at timestamptz NOT NULL DEFAULT now(),
    grid_res_deg double precision,
    store_uri    text,                               -- e.g. data/grids/gfs_2026092618.nc
    meta         jsonb NOT NULL DEFAULT '{}',
    UNIQUE (source_id, model, issue_time)
);

-- ------------------------------------------------------------------------
-- Canonical point record (observation, analysis or forecast)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weather_value (
    id          bigserial,
    run_id      bigint REFERENCES forecast_run(id) ON DELETE CASCADE,
    source_id   text NOT NULL REFERENCES data_source(id),
    model       text,
    issue_time  timestamptz,
    valid_time  timestamptz NOT NULL,
    variable    text NOT NULL,                       -- t2m, tp, u10m, rh, ...
    unit        text NOT NULL,
    value       double precision,
    confidence  real CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    admin_id    text REFERENCES admin_unit(id),      -- set for zonal statistics
    aggregation text,                                -- point | district_max | district_mean ...
    geom        geometry(Point, 4326),
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, valid_time)
) PARTITION BY RANGE (valid_time);
-- default partition; add monthly partitions in production (see docs/ARCHITECTURE.md)
CREATE TABLE IF NOT EXISTS weather_value_default PARTITION OF weather_value DEFAULT;
CREATE INDEX IF NOT EXISTS weather_value_var_time_ix ON weather_value (variable, valid_time);
CREATE INDEX IF NOT EXISTS weather_value_admin_ix ON weather_value (admin_id, variable, valid_time);
CREATE INDEX IF NOT EXISTS weather_value_geom_gix ON weather_value USING gist (geom);

-- ------------------------------------------------------------------------
-- Climatological normals (day-of-year, 1..366 calendar) per admin unit or grid cell
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS climatology_normal (
    source_id   text NOT NULL REFERENCES data_source(id),
    baseline    text NOT NULL,                       -- '1991-2020'
    method      text NOT NULL,                       -- '31-day centred window'
    admin_id    text REFERENCES admin_unit(id),
    cell        geometry(Point, 4326),
    variable    text NOT NULL,                       -- tmax, tmin, precip
    doy         smallint NOT NULL CHECK (doy BETWEEN 0 AND 365),
    value       double precision NOT NULL,
    unit        text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS climatology_normal_uix
    ON climatology_normal (source_id, baseline, coalesce(admin_id, ''), coalesce(ST_AsText(cell), ''), variable, doy);

-- ------------------------------------------------------------------------
-- Official warnings (CAP) — wording is stored verbatim, never edited
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS official_warning (
    id          text PRIMARY KEY,                    -- CAP identifier / SACHET guid
    source_id   text NOT NULL REFERENCES data_source(id),
    issuer      text NOT NULL,                       -- IMD Ahmedabad, CWC, GSDMA ...
    sender      text,
    event       text,
    severity    text,
    urgency     text,
    certainty   text,
    headline    text NOT NULL,
    description text,
    area_desc   text,
    effective   timestamptz,
    expires     timestamptz,
    geom        geometry(MultiPolygon, 4326),
    link        text,
    raw         jsonb,
    fetched_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS official_warning_geom_gix ON official_warning USING gist (geom);
CREATE INDEX IF NOT EXISTS official_warning_expires_ix ON official_warning (expires);

-- Many-to-many: which admin units a warning covers (by polygon or by name match)
CREATE TABLE IF NOT EXISTS official_warning_area (
    warning_id text REFERENCES official_warning(id) ON DELETE CASCADE,
    admin_id   text REFERENCES admin_unit(id),
    match      text NOT NULL CHECK (match IN ('polygon','district_name','state_name')),
    PRIMARY KEY (warning_id, admin_id)
);

-- ------------------------------------------------------------------------
-- System-derived risk assessments (auditable: rule + inputs + confidence)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_assessment (
    id            bigserial PRIMARY KEY,
    admin_id      text REFERENCES admin_unit(id),
    geom          geometry(Point, 4326),
    risk_id       text NOT NULL,                     -- heat, cold, rain, ...
    level         smallint NOT NULL CHECK (level BETWEEN 0 AND 3),
    period_start  timestamptz,
    period_end    timestamptz,
    peak_value    double precision,
    unit          text,
    criterion     text NOT NULL,
    methodology_ref text,                            -- M-HEAT etc.
    confidence    text,
    confidence_basis text,
    sources       text[] NOT NULL,
    run_ids       bigint[],
    computed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS risk_assessment_admin_ix ON risk_assessment (admin_id, risk_id, computed_at DESC);

-- ------------------------------------------------------------------------
-- Agro-advisories: official bulletins kept apart from system indicators
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agro_advisory (
    id          bigserial PRIMARY KEY,
    admin_id    text REFERENCES admin_unit(id),
    issuer      text NOT NULL,                       -- IMD AMFU Anand, KVK ...
    issued_on   date NOT NULL,
    valid_until date,
    language    text NOT NULL DEFAULT 'en',
    crop        text,
    body        text NOT NULL,
    url         text,
    official    boolean NOT NULL DEFAULT true,
    fetched_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO data_source (id, name, kind, licence, url, official) VALUES
  ('gfs_e2s',   'NOAA GFS 0.25° via Earth2Studio', 'forecast',   'Public domain (NOAA)', 'https://registry.opendata.aws/noaa-gfs-bdp-pds/', false),
  ('e2s_ai_fcn','Earth2Studio FourCastNet (experimental)', 'forecast', 'NVIDIA model licence', 'https://github.com/NVIDIA/earth2studio', false),
  ('openmeteo', 'Open-Meteo (ECMWF IFS, GFS, ICON)', 'forecast', 'CC BY 4.0', 'https://open-meteo.com', false),
  ('nasa_power','NASA POWER (MERRA-2)', 'climatology', 'NASA open data', 'https://power.larc.nasa.gov', false),
  ('sachet',    'NDMA SACHET CAP feed (IMD, CWC, SDMAs)', 'warning', 'Government of India', 'https://sachet.ndma.gov.in', true),
  ('imd',       'India Meteorological Department', 'observation', 'IMD data policy', 'https://mausam.imd.gov.in', true),
  ('mosdac',    'ISRO MOSDAC (INSAT-3D/3DR)', 'satellite', 'MOSDAC data policy', 'https://www.mosdac.gov.in', true)
ON CONFLICT (id) DO NOTHING;
