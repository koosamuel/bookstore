-- 빙고서점: 책 목록과 공유 대여 상태
create table if not exists public.books (
  id text primary key,
  title text not null,
  author text not null default '',
  grade text not null default '전 학년',
  description text not null default '',
  data_origin text not null default 'actual'
    check (data_origin in ('actual', 'synthetic')),
  cover_url text,
  emoji text,
  color text not null default '#e8f5ef',
  status text not null default 'available'
    check (status in ('available', 'borrowed')),
  borrowed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.books
  add column if not exists data_origin text not null default 'actual'
    check (data_origin in ('actual', 'synthetic'));

alter table public.books enable row level security;

-- 누구나 책 목록과 현재 대여 상태를 볼 수 있습니다.
create policy "books are publicly readable"
on public.books for select
to anon, authenticated
using (true);

-- 로그인한 운영자만 대여 상태를 변경할 수 있습니다.
create policy "authenticated operators can update books"
on public.books for update
to authenticated
using (true)
with check (true);

grant select on table public.books to anon, authenticated;
grant update (status, borrowed_at, updated_at) on table public.books to authenticated;
grant update (id, title, author, cover_url, updated_at) on table public.books to authenticated;

-- 관리자 모드에서 새 책을 등록하거나 삭제할 수 있습니다.
create policy "authenticated operators can insert books"
on public.books for insert
to authenticated
with check (true);

create policy "authenticated operators can delete books"
on public.books for delete
to authenticated
using (true);

grant insert, delete on table public.books to authenticated;

insert into public.books
  (id, data_origin, title, author, grade, description, emoji, color)
values
  ('B001', 'synthetic', '구름 위의 비밀 도서관', '가상 작가 1', '전 학년', '화면 시험을 위해 만든 가상 이야기입니다.', '☁️', '#dcefff'),
  ('B002', 'synthetic', '용감한 민들레', '가상 작가 2', '1~3학년', '화면 시험을 위해 만든 가상 이야기입니다.', '🌼', '#fff0b8'),
  ('B003', 'synthetic', '우리 반 우주 탐험대', '가상 작가 3', '3~6학년', '화면 시험을 위해 만든 가상 이야기입니다.', '🚀', '#e5ddff'),
  ('B004', 'synthetic', '고양이 탐정의 하루', '가상 작가 4', '전 학년', '화면 시험을 위해 만든 가상 이야기입니다.', '🐈', '#ffe0d6'),
  ('B005', 'synthetic', '바다를 지키는 작은 손', '가상 작가 5', '2~6학년', '화면 시험을 위해 만든 가상 이야기입니다.', '🐳', '#d9f5f2'),
  ('B006', 'synthetic', '내 마음의 무지개', '가상 작가 6', '전 학년', '화면 시험을 위해 만든 가상 이야기입니다.', '🌈', '#f8e0f1')
on conflict (id) do update set
  title = excluded.title,
  author = excluded.author,
  grade = excluded.grade,
  description = excluded.description,
  data_origin = excluded.data_origin,
  emoji = excluded.emoji,
  color = excluded.color,
  updated_at = now();

-- 다른 기기의 상태 변경을 즉시 받을 수 있도록 Realtime에 등록합니다.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'books'
  ) then
    alter publication supabase_realtime add table public.books;
  end if;
end $$;

-- 공개 표지 이미지 버킷. 쓰기와 삭제는 로그인한 운영자만 가능합니다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-covers', 'book-covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "book covers are publicly readable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'book-covers');

create policy "authenticated operators can upload book covers"
on storage.objects for insert
to authenticated
with check (bucket_id = 'book-covers');

create policy "authenticated operators can delete book covers"
on storage.objects for delete
to authenticated
using (bucket_id = 'book-covers');
