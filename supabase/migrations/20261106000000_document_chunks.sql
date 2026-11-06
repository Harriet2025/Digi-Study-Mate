-- Document ingestion schema: one row per uploaded file, many chunks per file.
create extension if not exists vector with schema extensions;

create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  filename     text        not null,
  mime_type    text        not null,
  source_type  text        not null check (source_type in ('pdf', 'pptx')),
  byte_size    integer     not null check (byte_size > 0),
  page_count   integer     not null check (page_count >= 0),
  chunk_count  integer     not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid        not null references public.documents (id) on delete cascade,
  filename     text        not null,
  chunk_index  integer     not null check (chunk_index >= 0),
  content      text        not null,
  token_count  integer     not null,
  -- 1-based page (PDF) or slide (PPTX) numbers this chunk spans.
  page_start   integer     not null,
  page_end     integer     not null,
  metadata     jsonb       not null default '{}'::jsonb,
  -- Filled in by a later embedding step. 1024 dims matches Voyage AI
  -- voyage-3 / voyage-3.5; change it if you choose a different model.
  embedding    extensions.vector(1024),
  created_at   timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists document_chunks_document_id_idx
  on public.document_chunks (document_id);

-- HNSW index for cosine similarity search; rows with NULL embeddings are skipped.
create index if not exists document_chunks_embedding_idx
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- Lock both tables down. The upload route writes with the service role key,
-- which bypasses RLS. Add per-user policies once auth is wired in.
alter table public.documents       enable row level security;
alter table public.document_chunks enable row level security;
