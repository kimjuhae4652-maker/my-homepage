create extension if not exists pgcrypto;

create table if not exists public.manifestos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  body text not null,
  locale text not null,
  author_name text,
  is_anonymous boolean not null default false,
  tags text[] not null,
  image_url text,
  status text not null default 'visible',
  constraint manifestos_locale_check check (locale in ('ko', 'en')),
  constraint manifestos_status_check check (status in ('visible', 'hidden')),
  constraint manifestos_body_length_check check (char_length(body) between 20 and 500),
  constraint manifestos_author_name_length_check check (
    author_name is null or char_length(author_name) <= 40
  ),
  constraint manifestos_tags_count_check check (coalesce(array_length(tags, 1), 0) between 1 and 3),
  constraint manifestos_tags_allowlist_check check (
    tags <@ array[
      'labor',
      'care',
      'housing',
      'climate',
      'technology',
      'education',
      'city',
      'community'
    ]::text[]
  )
);

create index if not exists manifestos_created_at_idx on public.manifestos (created_at desc);
create index if not exists manifestos_status_idx on public.manifestos (status);
create index if not exists manifestos_locale_idx on public.manifestos (locale);

alter table public.manifestos enable row level security;

drop policy if exists "Visible manifestos are publicly readable" on public.manifestos;
create policy "Visible manifestos are publicly readable"
on public.manifestos
for select
to anon
using (status = 'visible');

drop policy if exists "Anyone can submit a visible manifesto" on public.manifestos;
create policy "Anyone can submit a visible manifesto"
on public.manifestos
for insert
to anon
with check (
  status = 'visible'
  and locale in ('ko', 'en')
  and char_length(body) between 20 and 500
  and (author_name is null or char_length(author_name) <= 40)
  and coalesce(array_length(tags, 1), 0) between 1 and 3
  and tags <@ array[
    'labor',
    'care',
    'housing',
    'climate',
    'technology',
    'education',
    'city',
    'community'
  ]::text[]
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'manifesto-images',
  'manifesto-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view manifesto images" on storage.objects;
create policy "Public can view manifesto images"
on storage.objects
for select
to public
using (bucket_id = 'manifesto-images');

drop policy if exists "Anyone can upload manifesto images" on storage.objects;
create policy "Anyone can upload manifesto images"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'manifesto-images'
  and (storage.foldername(name))[1] = 'uploads'
  and array_length(storage.foldername(name), 1) = 3
);
