-- Exam & project defense preparation: generated question sets and graded attempts.

create table if not exists public.defense_question_sets (
  id                 uuid primary key default gen_random_uuid(),
  document_id        uuid references public.documents (id) on delete cascade,
  source_title       text,
  overall_weaknesses jsonb not null default '[]'::jsonb,
  -- Full questions including rubrics (never sent to the client before answering).
  questions          jsonb not null,
  model              text not null,
  created_at         timestamptz not null default now()
);

create index if not exists defense_question_sets_document_id_idx
  on public.defense_question_sets (document_id);

create table if not exists public.defense_attempts (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references public.defense_question_sets (id) on delete cascade,
  question_id text not null,
  answer_text text not null,
  input_mode  text not null check (input_mode in ('typed', 'spoken')),
  score       integer not null check (score between 0 and 100),
  evaluation  jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists defense_attempts_set_question_idx
  on public.defense_attempts (set_id, question_id, created_at desc);

-- Server-only access via the service role until auth is added.
alter table public.defense_question_sets enable row level security;
alter table public.defense_attempts      enable row level security;
