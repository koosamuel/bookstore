-- 실제 작품 편집 화면의 표지 선택과 작품 전체 대본 저장
-- 운영자 계정만 읽고 쓸 수 있으며 공개 독자에게는 노출하지 않습니다.

create table if not exists public.work_editor_drafts (
  work_key text primary key check (char_length(work_key) between 1 and 120),
  title text not null check (char_length(title) between 1 and 200),
  cover_page integer not null default 1 check (cover_page > 0),
  cover_image_path text not null default '',
  script text not null default '' check (char_length(script) <= 50000),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.work_editor_drafts enable row level security;

drop policy if exists "operator reads work editor drafts" on public.work_editor_drafts;
drop policy if exists "operator inserts work editor drafts" on public.work_editor_drafts;
drop policy if exists "operator updates work editor drafts" on public.work_editor_drafts;
drop policy if exists "operator deletes work editor drafts" on public.work_editor_drafts;

create policy "operator reads work editor drafts"
on public.work_editor_drafts for select to authenticated
using (auth.uid() = 'f0d2a994-5837-4bbb-9f27-818f079d4c65'::uuid);

create policy "operator inserts work editor drafts"
on public.work_editor_drafts for insert to authenticated
with check (
  auth.uid() = 'f0d2a994-5837-4bbb-9f27-818f079d4c65'::uuid
  and updated_by = auth.uid()
);

create policy "operator updates work editor drafts"
on public.work_editor_drafts for update to authenticated
using (auth.uid() = 'f0d2a994-5837-4bbb-9f27-818f079d4c65'::uuid)
with check (
  auth.uid() = 'f0d2a994-5837-4bbb-9f27-818f079d4c65'::uuid
  and updated_by = auth.uid()
);

create policy "operator deletes work editor drafts"
on public.work_editor_drafts for delete to authenticated
using (auth.uid() = 'f0d2a994-5837-4bbb-9f27-818f079d4c65'::uuid);

revoke all on table public.work_editor_drafts from anon;
grant select, insert, update, delete on table public.work_editor_drafts to authenticated;

