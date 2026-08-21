-- 회원가입 시 auth.users 기준 이메일 중복 확인 (서비스 롤에서만 호출)
create or replace function public.is_email_registered(check_email text)
returns boolean
language sql
stable
security definer
set search_path = auth, public
as $$
  select exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(trim(check_email))
  );
$$;

revoke all on function public.is_email_registered(text) from public;
revoke all on function public.is_email_registered(text) from anon;
revoke all on function public.is_email_registered(text) from authenticated;
grant execute on function public.is_email_registered(text) to service_role;
