# 공개 회원가입 · 로그인 (Supabase Auth)

이메일이 아이디입니다. Google/Kakao OAuth는 쓰지 않습니다.

## 대시보드에서 켤 것

Authentication → Providers → **Email**

- Enable Email provider
- **Confirm email** 켜기
- OTP(6자리) 메일을 쓰려면 이메일 템플릿에 `{{ .Token }}` 이 있어야 합니다.
  (Magic link만 있으면 숫자 코드가 안 갑니다.)

Authentication → URL Configuration

- Site URL: `https://whyup.net`
- Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://whyup.net/auth/callback`

비밀번호는 `auth.users`에 해시로만 저장됩니다. 앱에서 평문 비밀번호를 DB에 넣지 않습니다.

## `public.profiles`

SQL Editor에서 `20260819_profiles.sql` 을 실행하면 가입 시 `id`, `email`, `created_at`, `role`이 자동으로 들어갑니다.
