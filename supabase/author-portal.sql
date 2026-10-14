-- 어린이 작가 포털 API
-- 선행 조건: schema.sql, child-publishing.sql, engagement.sql
-- 공개 API에는 작품 지표만 포함하고, 마이 API는 운영자 인증과 작가 별칭으로 범위를 제한합니다.

create or replace function public.get_public_home_feed()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'rankings', coalesce(jsonb_agg(jsonb_build_object(
      'book_id', ranked.book_id,
      'title', ranked.title,
      'cover_url', ranked.cover_url,
      'unique_views', ranked.unique_views,
      'completions', ranked.completions,
      'approved_cheers', ranked.approved_comments,
      'ranking_score', ranked.ranking_score
    ) order by ranked.ranking_score desc, ranked.unique_views desc, ranked.book_id), '[]'::jsonb)
  )
  from (
    select b.id as book_id, b.title, b.cover_url,
      totals.unique_views, totals.completions, totals.approved_comments, totals.ranking_score
    from public.books b
    join public.book_engagement_totals totals on totals.book_id = b.id
    join public.book_engagement_settings settings on settings.book_id = b.id
    where b.publication_status = 'published' and settings.ranking_enabled
    order by totals.ranking_score desc, totals.unique_views desc, b.id
    limit 10
  ) ranked;
$$;

revoke all on function public.get_public_home_feed() from public;
grant execute on function public.get_public_home_feed() to anon, authenticated;

create or replace function public.get_author_dashboard(p_author_alias text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  clean_alias text := btrim(coalesce(p_author_alias, ''));
  result jsonb;
begin
  if auth.uid() is distinct from 'f0d2a994-5837-4bbb-9f27-818f079d4c65'::uuid then
    raise exception 'operator authentication required' using errcode = '42501';
  end if;
  if char_length(clean_alias) not between 1 and 100 then
    raise exception 'invalid author alias' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'author_alias', clean_alias,
    'generated_at', now(),
    'works', coalesce((
      select jsonb_agg(jsonb_build_object(
        'book_id', b.id,
        'title', b.title,
        'cover_url', b.cover_url,
        'emoji', b.emoji,
        'publication_status', b.publication_status,
        'unique_views', coalesce(t.unique_views, 0),
        'completions', coalesce(t.completions, 0),
        'approved_cheers', coalesce(t.approved_comments, 0)
      ) order by b.updated_at desc, b.id)
      from public.books b
      left join public.book_engagement_totals t on t.book_id = b.id
      where b.author = clean_alias
    ), '[]'::jsonb),
    'cheers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'book_id', c.book_id,
        'title', b.title,
        'body', c.body,
        'created_at', c.created_at
      ) order by c.created_at desc)
      from public.book_comments c
      join public.books b on b.id = c.book_id
      where b.author = clean_alias and c.status = 'approved'
      limit 50
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_author_dashboard(text) from public;
grant execute on function public.get_author_dashboard(text) to authenticated;
