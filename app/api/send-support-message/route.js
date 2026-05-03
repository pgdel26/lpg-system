import { Resend } from "resend";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const supportTo = process.env.SUPPORT_RECIPIENT_EMAIL;

  if (!apiKey || !from || !supportTo) {
    return Response.json(
      { error: "Email not configured. Set RESEND_API_KEY, RESEND_FROM_EMAIL, and SUPPORT_RECIPIENT_EMAIL in .env." },
      { status: 500 }
    );
  }

  const body = await request.json();
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const fromEmail = typeof body?.fromEmail === "string" ? body.fromEmail.trim().toLowerCase() : "";

  if (!subject || !message) {
    return Response.json({ error: "Subject and message are required." }, { status: 400 });
  }
  if (!EMAIL_RE.test(fromEmail)) {
    return Response.json({ error: "Sender email is invalid." }, { status: 400 });
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: [supportTo],
    replyTo: fromEmail,
    subject: `[TankTracker support] ${subject}`,
    text: `From: ${fromEmail}\n\n${message}`,
  });

  if (error) {
    return Response.json({ error: error.message || "Send failed" }, { status: 502 });
  }

  return Response.json({ ok: true, id: data?.id });
}
