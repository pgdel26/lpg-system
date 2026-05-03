import { Resend } from "resend";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return Response.json(
      { error: "Email not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL in .env." },
      { status: 500 }
    );
  }

  const body = await request.json();
  const recipients = Array.isArray(body?.recipients) ? body.recipients : [];
  const cleaned = recipients
    .map((r) => (typeof r === "string" ? r.trim().toLowerCase() : ""))
    .filter((r) => EMAIL_RE.test(r));

  if (cleaned.length === 0) {
    return Response.json({ error: "No valid recipients provided." }, { status: 400 });
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: cleaned,
    subject: "TankTracker test email",
    text: "This is a test email from TankTracker. If you received this, email notifications are working.",
  });

  if (error) {
    return Response.json({ error: error.message || "Send failed" }, { status: 502 });
  }

  return Response.json({ ok: true, id: data?.id, recipientCount: cleaned.length });
}
