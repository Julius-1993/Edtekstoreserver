const nodemailer = require('nodemailer');

const createTransporter = () => {
  console.log('EMAIL_USER:', process.env.EMAIL_USER);
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM);
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: { rejectUnauthorized: false },
  });
};


const headerHtml = `
  <div style="background:#0a1628;padding:28px 40px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:1px;">EDTEK INTERACTIVE</h1>
    <p style="color:#4a9eff;margin:6px 0 0;font-size:13px;letter-spacing:0.5px;">Inventory Management System</p>
  </div>
`;

const footerHtml = `
  <div style="background:#0a1628;padding:16px 40px;text-align:center;margin-top:0;">
    <p style="color:#6b8bb5;font-size:11px;margin:0;">
      EDTEK Interactive · Automated Notification · Do not reply to this email
    </p>
  </div>
`;

const sendDeliveryConfirmationEmail = async ({ request, recipientEmail, confirmationToken }) => {
  const transporter = createTransporter();
  const confirmUrl = `${process.env.FRONTEND_URL}/confirm-delivery/${confirmationToken}`;

  console.log('\n==================================================');
  console.log('DELIVERY CONFIRMATION LINK');
  console.log('Request:', request.requestNumber);
  console.log('Recipient:', recipientEmail);
  console.log('URL:', confirmUrl);
  console.log('==================================================\n');

  const itemsHtml = request.items.map(item => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:10px 8px;font-size:13px;font-family:monospace;">${item.serialNumber}</td>
      <td style="padding:10px 8px;font-size:13px;font-weight:600;">${item.name}${item.screenSize ? ` ${item.screenSize}"` : ''}</td>
      <td style="padding:10px 8px;font-size:13px;color:#64748b;">${item.specification || ''}</td>
      <td style="padding:10px 8px;font-size:13px;text-align:right;font-weight:700;">${item.quantityApproved} ${item.unit || 'pcs'}</td>
    </tr>
  `).join('');

  // Software checklist HTML if exists
  const softwareHtml = request.softwareChecklist?.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h3 style="font-size:14px;font-weight:700;color:#0a1628;margin:0 0 12px;">Software Installation Status</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#0a1628;">
            <th style="padding:8px 12px;color:#fff;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;">Software</th>
            <th style="padding:8px 12px;color:#fff;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${request.softwareChecklist.map(sw => {
    const name = sw.name === 'Other' && sw.customName ? sw.customName : sw.name;
    const statusColor = sw.status === 'Activated' ? '#16a34a' : sw.status === 'Non Activated' ? '#dc2626' : '#64748b';
    return `<tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:8px 12px;font-size:13px;">${name}</td>
              <td style="padding:8px 12px;font-size:13px;font-weight:700;color:${statusColor};">${sw.status}</td>
            </tr>`;
  }).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: recipientEmail,
    subject: `Delivery Confirmation Required — ${request.requestNumber}`,
    text: `EDTEK Interactive — Delivery Confirmation\n\nRequest ${request.requestNumber} has been delivered to ${request.toOrganization}.\n\nConfirm delivery here:\n${confirmUrl}\n\nItems:\n${request.items.map(i => `- ${i.name} (${i.serialNumber}) x${i.quantityApproved}`).join('\n')}\n\nLink expires in 72 hours.`,
    html: `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:620px;margin:32px auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
  ${headerHtml}
  <div style="background:#ffffff;padding:40px;">
    <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hello,</p>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">
      Items from Request <strong style="color:#0a1628;">#${request.requestNumber}</strong> have been shipped to
      <strong style="color:#0a1628;">${request.toOrganization}</strong>.
      Please review the items below and confirm successful delivery.
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin-bottom:24px;">
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr><td style="color:#94a3b8;padding:3px 0;width:130px;">Request #</td><td style="color:#0a1628;font-weight:700;">${request.requestNumber}</td></tr>
        <tr><td style="color:#94a3b8;padding:3px 0;">Organization</td><td style="color:#1e293b;font-weight:600;">${request.toOrganization}</td></tr>
        <tr><td style="color:#94a3b8;padding:3px 0;">Department</td><td style="color:#1e293b;">${request.toDepartment}</td></tr>
        <tr><td style="color:#94a3b8;padding:3px 0;">Shipped On</td><td style="color:#1e293b;">${new Date(request.shippedAt || request.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td></tr>
      </table>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:28px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#0a1628;">
          <th style="padding:10px 8px;color:#fff;text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Serial No.</th>
          <th style="padding:10px 8px;color:#fff;text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Item</th>
          <th style="padding:10px 8px;color:#fff;text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Specification</th>
          <th style="padding:10px 8px;color:#fff;text-align:right;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Qty</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    ${softwareHtml}

    <div style="text-align:center;margin-bottom:20px;">
      <a href="${confirmUrl}" target="_blank"
         style="display:inline-block;background:#0a1628;color:#ffffff;text-decoration:none;padding:15px 40px;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:0.3px;">
        Confirm Successful Delivery
      </a>
    </div>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin-bottom:20px;text-align:center;">
      <p style="color:#1d4ed8;font-size:12px;font-weight:600;margin:0 0 6px;">If the button doesn't work, copy this link:</p>
      <p style="margin:0;word-break:break-all;">
        <a href="${confirmUrl}" style="color:#2563eb;font-size:12px;">${confirmUrl}</a>
      </p>
    </div>

    <p style="color:#94a3b8;font-size:12px;text-align:center;line-height:1.6;">
      This link expires in <strong>72 hours</strong>.<br>
      If any items are missing, you can add a note during confirmation.
    </p>
  </div>
  ${footerHtml}
</div>
</body></html>`
  });
};

const sendStatusEmail = async ({ recipientEmail, subject, message, requestNumber }) => {
  const transporter = createTransporter();
  console.log('Status email →', recipientEmail, '|', subject);
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: recipientEmail,
    subject,
    text: `EDTEK Interactive\nRequest #${requestNumber}\n\n${message.replace(/<[^>]*>/g, '')}`,
    html: `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:620px;margin:32px auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
  ${headerHtml}
  <div style="background:#ffffff;padding:40px;">
    <p style="color:#475569;font-size:14px;line-height:1.8;">${message}</p>
  </div>
  ${footerHtml}
</div>
</body></html>`
  });
};

// ─── Welcome / Account creation email ─────────────────────────────────────────
const sendWelcomeEmail = async ({ name, email, password, role, resetUrl, expiryHours = 72, isResend = false, isAdminReset = false, isForgot = false }) => {
  const transporter = createTransporter();

  let subject, bodyHtml;

  if (isForgot) {
    subject = 'Reset Your EDTEK StoreTrack Password';
    bodyHtml = `
      <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hello <strong>${name}</strong>,</p>
      <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">
        We received a request to reset your EDTEK StoreTrack password.
        Click the button below to set a new password.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${resetUrl}" target="_blank"
           style="display:inline-block;background:#0a1628;color:#ffffff;text-decoration:none;
                  padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">
          Reset My Password
        </a>
      </div>
      <p style="color:#94a3b8;font-size:12px;text-align:center;">
        This link expires in <strong>${expiryHours} hour${expiryHours === 1 ? '' : 's'}</strong>. If you didn't request this, ignore this email.
      </p>`;
  } else if (isAdminReset) {
    subject = 'Your EDTEK StoreTrack Password Has Been Reset';
    bodyHtml = `
      <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hello <strong>${name}</strong>,</p>
      <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">
        An administrator has reset your password on <strong>EDTEK StoreTrack</strong>.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;">
        <table style="font-size:14px;border-collapse:collapse;">
          <tr><td style="color:#94a3b8;padding:4px 16px 4px 0;width:160px;">Email</td><td style="color:#0a1628;font-weight:600;">${email}</td></tr>
          <tr><td style="color:#94a3b8;padding:4px 16px 4px 0;">Temporary Password</td><td style="color:#0a1628;font-weight:700;font-family:monospace;font-size:15px;">${password}</td></tr>
        </table>
      </div>
      <p style="color:#dc2626;font-size:13px;font-weight:600;margin:0 0 16px;">
        ⚠ This temporary password expires in 48 hours. Log in and change it immediately.
      </p>`;
  } else if (isResend) {
    subject = 'New Password Reset Link — EDTEK StoreTrack';
    bodyHtml = `
      <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hello <strong>${name}</strong>,</p>
      <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">
        A new password reset link has been sent for your EDTEK StoreTrack account.<br>
        Click the button below to set your password.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${resetUrl}" target="_blank"
           style="display:inline-block;background:#0a1628;color:#ffffff;text-decoration:none;
                  padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">
          Set My Password
        </a>
      </div>
      <p style="color:#dc2626;font-size:13px;font-weight:600;text-align:center;margin:0 0 8px;">
        ⚠ This link expires in <strong>${expiryHours} hours</strong>.
      </p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;text-align:center;margin-top:16px;">
        <p style="color:#1d4ed8;font-size:12px;margin:0 0 4px;font-weight:600;">If the button doesn't work, copy this link:</p>
        <p style="margin:0;word-break:break-all;"><a href="${resetUrl}" style="color:#2563eb;font-size:11px;">${resetUrl}</a></p>
      </div>`;
  } else {
    // First-time account creation
    subject = 'Welcome to EDTEK StoreTrack — Your Account Details';
    bodyHtml = `
      <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hello <strong>${name}</strong>,</p>
      <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">
        Your account has been created on <strong>EDTEK Interactive StoreTrack</strong>. Here are your login details:
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;">
        <table style="font-size:14px;border-collapse:collapse;">
          <tr><td style="color:#94a3b8;padding:4px 16px 4px 0;width:160px;">Full Name</td><td style="color:#0a1628;font-weight:600;">${name}</td></tr>
          <tr><td style="color:#94a3b8;padding:4px 16px 4px 0;">Email</td><td style="color:#0a1628;font-weight:600;">${email}</td></tr>
          <tr><td style="color:#94a3b8;padding:4px 16px 4px 0;">Role</td><td style="color:#0a1628;font-weight:600;text-transform:capitalize;">${role}</td></tr>
          <tr><td style="color:#94a3b8;padding:4px 16px 4px 0;">Temporary Password</td><td style="color:#dc2626;font-weight:700;font-family:monospace;font-size:15px;">${password}</td></tr>
        </table>
      </div>
      <p style="color:#dc2626;font-size:13px;font-weight:700;margin:0 0 8px;">
        ⚠ This temporary password expires in 48 hours.
      </p>
      <p style="color:#475569;font-size:14px;margin:0 0 24px;">
        Please reset your password immediately using the button below:
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${resetUrl}" target="_blank"
           style="display:inline-block;background:#1a56db;color:#ffffff;text-decoration:none;
                  padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">
          Set My Password Now →
        </a>
      </div>
      <p style="color:#dc2626;font-size:13px;font-weight:600;text-align:center;margin:0 0 8px;">
        This setup link expires in <strong>${expiryHours} hours</strong>.
      </p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;text-align:center;margin-top:16px;">
        <p style="color:#1d4ed8;font-size:12px;margin:0 0 4px;font-weight:600;">If the button doesn't work, copy this link:</p>
        <p style="margin:0;word-break:break-all;"><a href="${resetUrl}" style="color:#2563eb;font-size:11px;">${resetUrl}</a></p>
      </div>`;
  }

  const headerHtmlLocal = `
    <div style="background:#0a1628;padding:28px 40px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:1px;">EDTEK INTERACTIVE</h1>
      <p style="color:#4a9eff;margin:6px 0 0;font-size:13px;">Inventory Management System</p>
    </div>`;
  const footerHtmlLocal = `
    <div style="background:#0a1628;padding:16px 40px;text-align:center;">
      <p style="color:#6b8bb5;font-size:11px;margin:0;">EDTEK Interactive · Automated Notification · Do not reply</p>
    </div>`;

  console.log('Welcome email →', email, '|', subject);
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject,
    text: `${subject}\n\n${bodyHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()}`,
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:620px;margin:32px auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
  ${headerHtmlLocal}
  <div style="background:#ffffff;padding:40px;">${bodyHtml}</div>
  ${footerHtmlLocal}
</div>
</body></html>`
  });
};

module.exports = { sendDeliveryConfirmationEmail, sendStatusEmail, sendWelcomeEmail };
