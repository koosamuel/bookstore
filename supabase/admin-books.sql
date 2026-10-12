-- 관리자 도서 추가·삭제와 표지 이미지 저장소

drop policy if exists "authenticated operators can insert books" on public.books;
create policy "authenticated operators can insert books"
on public.books for insert
to authenticated
with check (true);

drop policy if exists "authenticated operators can delete books" on public.books;
create policy "authenticated operators can delete books"
on public.books for delete
to authenticated
using (true);

grant insert, delete on table public.books to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-covers',
  'book-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "book covers are publicly readable" on storage.objects;
create policy "book covers are publicly readable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'book-covers');

drop policy if exists "authenticated operators can upload book covers" on storage.objects;
create policy "authenticated operators can upload book covers"
on storage.objects for insert
to authenticated
with check (bucket_id = 'book-covers');

drop policy if exists "authenticated operators can delete book covers" on storage.objects;
create policy "authenticated operators can delete book covers"
on storage.objects for delete
to authenticated
using (bucket_id = 'book-covers');
