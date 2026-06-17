create table if not exists bookmarks (
  id bigserial primary key,
  url text not null,
  created_at timestamptz not null default now()
);
