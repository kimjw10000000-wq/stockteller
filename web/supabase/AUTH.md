# 공개 회원가입 · 로그인 (Supabase Auth)

앱 코드는 이미 연결되어 있습니다. 아래는 **Supabase 대시보드에서 한 번** 해야 하는 설정입니다.

## 1. Redirect URL

Authentication → URL Configuration

- Site URL: `https://whyup.net`
- Redirect URLs에 추가:
  - `http://localhost:3000/auth/callback`
  - `https://whyup.net/auth/callback`

비밀번호 재설정 메일도 같은 콜백으로 들어옵니다 (`/auth/callback?next=/reset-password`).

## 2. OAuth 제공자

Authentication → Providers

- **Google**: Enable 후 Client ID / Secret
- **Kakao**: Enable 후 REST API 키

앱 키는 사이트 `.env`가 아니라 **Supabase 대시보드**에만 넣습니다.

## 3. `public.profiles` 자동 생성

SQL Editor에서 `20260819_profiles.sql` 전체를 실행하세요.

가입(이메일·Google·Kakao) 시 `auth.users` INSERT 트리거가 `profiles`에
`id`, `email`, `created_at`, `role`(기본값 `user`) 을 넣습니다.
