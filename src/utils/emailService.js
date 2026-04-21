const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Sends an email with HTML content.
 * @param {string} to - Recipient email.
 * @param {string} subject - Email subject.
 * @param {string} htmlContent - HTML body content.
 * @param {Array} [attachments] - Optional email attachments for CIDs, etc.
 */
async function sendEmail(to, subject, htmlContent, attachments = []) {
    try {
        const info = await transporter.sendMail({
            from: `"Job Order System" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html: htmlContent,
            attachments: attachments,
        });
        console.log(`Email sent to ${to}: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error(`Error sending email to ${to}:`, error);
        throw error;
    }
}

module.exports = { sendEmail };
