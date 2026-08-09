/**
 * Sends an HTML email via the Resend HTTP API.
 * Workers can't open raw SMTP sockets, so this replaces the old
 * nodemailer/SMTP transport with a plain fetch() call.
 */
export async function sendEmail(env, to, subject, htmlContent) {
    const fromEmail = env.MAIL_FROM || 'onboarding@resend.dev';

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: `Job Order System <${fromEmail}>`,
            to: [to],
            subject,
            html: htmlContent,
        }),
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Resend API error (${res.status}): ${errText}`);
    }

    const info = await res.json();
    console.log(`Email sent to ${to}: ${info.id}`);
    return info;
}
