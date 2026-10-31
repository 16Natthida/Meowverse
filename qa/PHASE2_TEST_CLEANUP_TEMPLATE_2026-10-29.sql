-- Meowverse Phase 2.1 — Test-only Cleanup / Rollback Template
-- STATUS: PREPARED ONLY — NOT EXECUTED
-- This file must never be run against `meowverse`.

-- Read-only preflight. Confirm the exact schema name before any cleanup approval.
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name IN ('meowverse','meowverse_test')
ORDER BY schema_name;

-- Preferred rollback for a fully isolated environment is to stop only the QA
-- processes (5174/3002), archive QA evidence, remove only the isolated QA uploads,
-- and drop only the exact test database. The destructive statement remains
-- commented until a separate cleanup approval is granted:

-- DROP DATABASE IF EXISTS `meowverse_test`;

-- Never add wildcard schema names, dynamic SQL, or DROP statements for `meowverse`.

