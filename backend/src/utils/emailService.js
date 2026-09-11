import ApiError from './ApiError.js';

/**
 * Send an OTP email via Brevo (Sendinblue) REST API.
 * Uses BREVO_API_KEY and BREVO_SENDER_EMAIL from environment.
 */
export const sendOtpEmail = async (toEmail, otp) => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderEmail) {
    throw new ApiError(500, 'Email service not configured (missing BREVO_API_KEY or BREVO_SENDER_EMAIL)', 'EMAIL_CONFIG_ERROR');
  }

  const payload = {
    sender: { name: 'KHM ERP', email: senderEmail },
    to: [{ email: toEmail }],
    subject: 'KHM ERP — Password Reset OTP',
    htmlContent: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #3b82f6); color: white; font-weight: 800; font-size: 20px; padding: 12px 20px; border-radius: 12px; letter-spacing: 2px;">KHM</div>
        </div>
        <h2 style="text-align: center; color: #1e293b; margin-bottom: 8px;">Password Reset OTP</h2>
        <p style="text-align: center; color: #64748b; font-size: 14px; margin-bottom: 24px;">
          You requested a password reset for your KHM ERP account. Use the OTP below to proceed:
        </p>
        <div style="text-align: center; background: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <span style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #4f46e5;">${otp}</span>
        </div>
        <p style="text-align: center; color: #94a3b8; font-size: 12px;">
          This OTP is valid for <strong>10 minutes</strong>. If you didn't request this, please ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="text-align: center; color: #cbd5e1; font-size: 11px;">
          KHM ERP — Internal Use Only
        </p>
      </div>
    `,
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Brevo email error:', response.status, errorBody);
    throw new ApiError(500, 'Failed to send OTP email. Please try again.', 'EMAIL_SEND_ERROR');
  }

  return true;
};
