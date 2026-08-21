import { NextResponse } from "next/server";
import { sendSignupOtp } from "@/lib/auth/send-signup-otp";
import { validateEmail } from "@/lib/auth/validation";

export async function POST(request: Request) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: string };
    email = (body.email ?? "").trim();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const emailErr = validateEmail(email);
  if (emailErr) {
    return NextResponse.json({ error: emailErr }, { status: 400 });
  }

  try {
    await sendSignupOtp(email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "인증 메일을 보내지 못했습니다.";
    const status = message.includes("RESEND_API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
