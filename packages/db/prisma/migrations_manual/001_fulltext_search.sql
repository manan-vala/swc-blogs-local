-- Full-text search — apply after the first `prisma migrate dev`.
-- Prisma has no tsvector type, so this stays a hand-written migration
-- (see design doc §5). Copy this into a generated migration folder,
-- or run it manually against the database once.

ALTER TABLE "Post" ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;

CREATE INDEX post_search_idx ON "Post" USING GIN (search_vector);
