# 공개 회원가입 · 로그인 (Supabase Auth)

이메일이 아이디입니다. 메일은 **Supabase Auth가 보내지만**, 실제 배달·보낸이 이름은 **Custom SMTP**에 달립니다.

프로젝트: https://supabase.com/dashboard/project/rdowjqighztnfplgckqd

## 왜 인증번호가 안 오나

Supabase **기본 메일**은 프로덕션용이 아닙니다.

- 조직 **팀원 이메일로만** 발송됩니다. 그 외 주소는 `Email address not authorized` 로 거절됩니다.
- 한 시간에 **2통** 제한입니다.
- 기본 템플릿은 **매직 링크**라서 6자리 숫자가 안 보입니다.

그래서 일반 가입자에게 코드를 보내려면 Custom SMTP가 필요합니다.

## 보낸이 이름을 whyup으로

기본 발신(`noreply@mail.app.supabase.io`, 이름 Supabase Auth)에서는 **이름만 바꾸는 설정이 없습니다.**

Authentication → [SMTP](https://supabase.com/dashboard/project/rdowjqighztnfplgckqd/auth/smtp)

1. Enable Custom SMTP
2. **Sender name:** `whyup`
3. **Sender email:** `noreply@whyup.net` (도메인 인증 후)
4. SMTP 호스트/포트/계정은 아래 Resend 예시

보낸이 표시는 `whyup <noreply@whyup.net>` 이 됩니다. 주소까지 supabase.io로 유지하면서 이름만 whyup은 불가합니다.

### Resend 예시 (권장)

1. https://resend.com 가입
2. Domain에 `whyup.net` 추가 → DNS(SPF/DKIM) 등록
3. API Key 발급
4. Supabase SMTP:

| 항목 | 값 |
|------|-----|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API Key |
| Sender name | `whyup` |
| Sender email | `noreply@whyup.net` |

저장 직후 한도는 **시간당 30통**으로만 올라갑니다. 바로
[Rate Limits](https://supabase.com/dashboard/project/rdowjqighztnfplgckqd/auth/rate-limits)
에서 **Emails** 를 `300`~`1000`(시간당)으로 올립니다. 이 숫자는 Resend 플랜 한도를 넘지 않게 맞춥니다.

가입 인증번호는 앱이 Resend API로 직접 보냅니다. Vercel / `.env.local`에 `RESEND_API_KEY`가 있어야 합니다.

## 6자리 코드가 메일 본문에 오게

Authentication → [Email Templates](https://supabase.com/dashboard/project/rdowjqighztnfplgckqd/auth/templates)

**Magic Link** (OTP와 같은 템플릿) 을 아래로 바꿉니다. 링크(`{{ .ConfirmationURL }}`)는 넣지 마세요. 클릭하면 코드가 소모됩니다.

제목:

```
whyup 인증번호
```

본문:

```html
<h2>인증번호</h2>
<p style="font-size:28px;letter-spacing:6px;font-weight:bold;">{{ .Token }}</p>
<p>아래 사이트에 6자리 숫자를 입력하세요. 잠시 후 만료됩니다.</p>
```

## URL

Authentication → URL Configuration

- Site URL: `https://whyup.net`
- Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://whyup.net/auth/callback`

## 기타

- Providers → Email 켜기, Confirm email 켜기
- 비밀번호는 `auth.users`에 해시로만 저장됩니다
- `public.profiles` 는 SQL Editor에서 `20260819_profiles.sql` 실행
