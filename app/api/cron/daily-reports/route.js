import * as XLSX from "xlsx-js-style";
import { Resend } from "resend";
import { getAdminDb } from "../../../../lib/firebaseAdmin";
import { buildSalesReportWorkbook } from "../../../../lib/reports/salesReport";
import { today } from "../../../../lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return Response.json({ error: "Email not configured (RESEND_API_KEY, RESEND_FROM_EMAIL)." }, { status: 500 });
  }

  const date = today();

  let db;
  try {
    db = getAdminDb();
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  try {
    const [
      salesSnap, swapsSnap, refundsSnap, expensesSnap,
      staffSnap, dailyReportSnap, arSnap, settingsSnap,
    ] = await Promise.all([
      db.collection("saleTransactions").where("date", "==", date).get(),
      db.collection("swaps").where("date", "==", date).get(),
      db.collection("refunds").where("date", "==", date).get(),
      db.collection("expenses").where("date", "==", date).get(),
      db.collection("staff").get(),
      db.collection("dailyReport").doc(date).get(),
      db.collection("saleTransactions").where("paymentType", "==", "ar").get(),
      db.collection("settings").doc("notifications").get(),
    ]);

    const recipients = settingsSnap.exists
      ? (settingsSnap.data().recipients || []).map((r) => r.email).filter(Boolean)
      : [];

    if (recipients.length === 0) {
      return Response.json({ ok: true, date, skipped: "no recipients configured" });
    }

    const data = {
      date,
      saleTransactions: salesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      swaps: swapsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      refunds: refundsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      expenses: expensesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      staff: staffSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      dailyReport: dailyReportSnap.exists ? dailyReportSnap.data() : { cashier: null, staff: [] },
      arTransactions: arSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    };

    const wb = buildSalesReportWorkbook(data);
    const salesBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const resend = new Resend(apiKey);
    const { data: emailData, error } = await resend.emails.send({
      from,
      to: recipients,
      subject: `TankTracker — Daily Reports — ${date}`,
      text: `Attached: Sales Report for ${date}.\n\nThis is an automated email from TankTracker.`,
      attachments: [
        { filename: `Sales_Report_${date}.xlsx`, content: salesBuffer.toString("base64") },
      ],
    });

    if (error) {
      return Response.json({ error: error.message || "Send failed" }, { status: 502 });
    }

    return Response.json({
      ok: true,
      date,
      id: emailData?.id,
      recipientCount: recipients.length,
    });
  } catch (err) {
    console.error("Daily reports cron error:", err);
    return Response.json({ error: err.message || "Cron failed" }, { status: 500 });
  }
}
