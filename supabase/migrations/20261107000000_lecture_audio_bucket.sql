-- Public bucket for generated lecture audio and playback manifests.
-- Files live under an unguessable UUID folder per script; the server writes
-- with the service role key, so no insert/update policies are needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lecture-audio', 'lecture-audio', true, 52428800, array['audio/mpeg', 'application/json'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
