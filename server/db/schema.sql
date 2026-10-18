-- Database schema for the upcycling recommendation system (SQLite).
-- Bilingual content is stored in *_uk / *_en column pairs; at least one of each pair is non-null.

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS craft_project_tools;
DROP TABLE IF EXISTS craft_project_steps;
DROP TABLE IF EXISTS craft_project_materials;
DROP TABLE IF EXISTS craft_projects;
DROP TABLE IF EXISTS tools;
DROP TABLE IF EXISTS materials;

CREATE TABLE materials (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name_uk  TEXT NOT NULL,
  name_en  TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('plastic', 'paper', 'glass', 'textile', 'metal', 'other'))
);

CREATE TABLE tools (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name_uk TEXT NOT NULL,
  name_en TEXT NOT NULL
);

CREATE TABLE craft_projects (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title_uk       TEXT,
  title_en       TEXT,
  description_uk TEXT,
  description_en TEXT,
  category       TEXT NOT NULL CHECK (category IN ('decor', 'storage', 'garden', 'toys', 'accessories', 'household')),
  difficulty     TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  estimated_time INTEGER NOT NULL CHECK (estimated_time BETWEEN 1 AND 1440),
  photo_url      TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (title_uk IS NOT NULL OR title_en IS NOT NULL)
);

CREATE TABLE craft_project_materials (
  project_id  INTEGER NOT NULL REFERENCES craft_projects(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  quantity    TEXT,
  is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0, 1)),
  PRIMARY KEY (project_id, material_id)
);

CREATE TABLE craft_project_steps (
  project_id  INTEGER NOT NULL REFERENCES craft_projects(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL CHECK (step_number >= 1),
  text_uk     TEXT,
  text_en     TEXT,
  PRIMARY KEY (project_id, step_number),
  CHECK (text_uk IS NOT NULL OR text_en IS NOT NULL)
);

CREATE TABLE craft_project_tools (
  project_id INTEGER NOT NULL REFERENCES craft_projects(id) ON DELETE CASCADE,
  tool_id    INTEGER NOT NULL REFERENCES tools(id) ON DELETE RESTRICT,
  PRIMARY KEY (project_id, tool_id)
);

CREATE INDEX idx_cpm_material ON craft_project_materials(material_id);
CREATE INDEX idx_projects_difficulty ON craft_projects(difficulty);
CREATE INDEX idx_projects_category ON craft_projects(category);
