const express = require('express');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const User    = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { sendStatusEmail, sendWelcomeEmail } = require('../utils/email');

const router  = express.Router();
const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// ─── ADMIN: Create user with temp password + reset link ──────────────────────
router.post('/create-user', protect, authorize('admin'), async (req, res) => {
  try {
    const { name, email, password, role, department, phone } = req.body;
    if (!name || !email || !password || !role)
      return res.status(400).json({ success: false, message: 'Name, email, password and role are required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });

    // Generate reset token for first-time password setup (valid 72hrs)
    const resetToken  = crypto.randomBytes(32).toString('hex');
    const tokenHashed = crypto.createHash('sha256').update(resetToken).digest('hex');

    const user = await User.create({
      name, email, password, role, department, phone,
      createdBy:         req.user._id,
      isTempPassword:    true,
      tempPasswordExpiry: new Date(Date.now() + 48 * 60 * 60 * 1000), // temp pwd valid 48h
      resetPasswordToken:  tokenHashed,
      resetPasswordExpiry: new Date(Date.now() + 72 * 60 * 60 * 1000)  // reset link valid 72h
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    try {
      await sendWelcomeEmail({ name, email, password, role, resetUrl, expiryHours: 72 });
    } catch (e) { console.error('Welcome email error:', e.message); }

    res.status(201).json({ success: true, user });
  } catch (err) {
    console.error('Create user error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
});

// ADMIN: Resend reset link (new link, valid 24h)
router.post('/users/:id/resend-reset', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const resetToken  = crypto.randomBytes(32).toString('hex');
    const tokenHashed = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken  = tokenHashed;
    user.resetPasswordExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    await sendWelcomeEmail({
      name: user.name,
      email: user.email,
      password: null, // don't re-show temp password
      role: user.role,
      resetUrl,
      expiryHours: 24,
      isResend: true
    });

    res.json({ success: true, message: 'Reset link resent (valid 24h)' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

    const user = await User.findOne({ email }).select('+password +isTempPassword +tempPasswordExpiry');
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (!user.isActive) return res.status(401).json({ success: false, message: 'Account deactivated. Contact admin.' });
    if (user.isFlagged)  return res.status(401).json({ success: false, message: 'Account flagged. Contact admin.' });

    // Block login if temp password has expired (48h window passed without resetting)
    if (user.isTempPassword && user.tempPasswordExpiry && new Date() > user.tempPasswordExpiry) {
      return res.status(401).json({
        success: false,
        message: 'Your temporary password has expired. Please contact your admin to resend a new reset link.',
        code: 'TEMP_PASSWORD_EXPIRED'
      });
    }

    user.lastLogin = new Date();
    user.activityLog.push({ action: 'login', details: 'User logged in', timestamp: new Date() });
    if (user.activityLog.length > 100) user.activityLog = user.activityLog.slice(-100);
    await user.save();

    const token = signToken(user._id);
    const userObj = user.toJSON();

    // Tell frontend if user must reset password
    res.json({
      success: true,
      token,
      user: userObj,
      mustResetPassword: !!user.isTempPassword
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET ME ───────────────────────────────────────────────────────────────────
router.get('/me', protect, (req, res) => res.json({ success: true, user: req.user }));

// ─── GET ALL USERS (admin) ────────────────────────────────────────────────────
router.get('/users', protect, authorize('admin'), async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .populate('createdBy', 'name email')
      .populate('flaggedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── GET SINGLE USER (admin) ──────────────────────────────────────────────────
router.get('/users/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('createdBy flaggedBy', 'name email');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── UPDATE USER (admin) ──────────────────────────────────────────────────────
router.put('/users/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const { name, email, role, department, phone, isActive } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (name     !== undefined) user.name       = name;
    if (email    !== undefined) user.email      = email;
    if (role     !== undefined) user.role       = role;
    if (department !== undefined) user.department = department;
    if (phone    !== undefined) user.phone      = phone;
    if (isActive !== undefined) user.isActive   = isActive;
    user.activityLog.push({ action: 'profile_updated', details: 'Updated by admin', timestamp: new Date() });
    await user.save();
    res.json({ success: true, user: user.toJSON() });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ─── ADMIN RESET USER PASSWORD ────────────────────────────────────────────────
router.put('/users/:id/reset-password', protect, authorize('admin'), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.password        = newPassword;
    user.isTempPassword  = true;
    user.tempPasswordExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
    user.activityLog.push({ action: 'password_reset', details: 'Password reset by admin', timestamp: new Date() });
    await user.save();

    try {
      await sendWelcomeEmail({
        name: user.name,
        email: user.email,
        password: newPassword,
        role: user.role,
        resetUrl: null,
        isResend: false,
        isAdminReset: true
      });
    } catch (e) { console.error('Reset email error:', e.message); }

    res.json({ success: true, message: 'Password reset. User notified by email.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── FLAG / UNFLAG USER (admin) ───────────────────────────────────────────────
router.put('/users/:id/flag', protect, authorize('admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user._id.toString() === req.user._id.toString())
      return res.status(400).json({ success: false, message: 'Cannot flag yourself' });

    user.isFlagged  = !user.isFlagged;
    user.flagReason = user.isFlagged ? reason : undefined;
    user.flaggedAt  = user.isFlagged ? new Date() : undefined;
    user.flaggedBy  = user.isFlagged ? req.user._id : undefined;
    if (user.isFlagged) user.isActive = false;
    user.activityLog.push({ action: user.isFlagged ? 'flagged' : 'unflagged', details: reason || '', timestamp: new Date() });
    await user.save();
    res.json({ success: true, user: user.toJSON(), message: user.isFlagged ? 'User flagged' : 'User unflagged' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── DELETE USER (admin) ──────────────────────────────────────────────────────
router.delete('/users/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user._id.toString() === req.user._id.toString())
      return res.status(400).json({ success: false, message: 'Cannot delete yourself' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── SELF: Change own password (after temp password login) ───────────────────
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (currentPassword) {
      const ok = await user.comparePassword(currentPassword);
      if (!ok) return res.status(401).json({ success: false, message: 'Current password is wrong' });
    }

    user.password          = newPassword;
    user.isTempPassword    = false;
    user.tempPasswordExpiry = undefined;
    user.activityLog.push({ action: 'password_changed', details: 'User changed own password', timestamp: new Date() });
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── PUBLIC: Forgot password ──────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });

    const resetToken  = crypto.randomBytes(32).toString('hex');
    const tokenHashed = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordToken  = tokenHashed;
    user.resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1h
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await sendWelcomeEmail({ name: user.name, email: user.email, password: null, role: user.role, resetUrl, expiryHours: 1, isForgot: true });
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send reset email' });
  }
});

// ─── PUBLIC: Reset password via token ─────────────────────────────────────────
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user   = await User.findOne({ resetPasswordToken: hashed, resetPasswordExpiry: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: 'Reset link invalid or expired' });

    user.password            = password;
    user.isTempPassword      = false;
    user.tempPasswordExpiry  = undefined;
    user.resetPasswordToken  = undefined;
    user.resetPasswordExpiry = undefined;
    user.activityLog.push({ action: 'password_reset_via_link', details: 'Password reset via email link', timestamp: new Date() });
    await user.save();

    const token = signToken(user._id);
    res.json({ success: true, message: 'Password reset! You can now log in.', token, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/test-email', async (req, res) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: 'aakojuliusoluwanifemi@gmail.com',
      subject: 'Brevo Test',
      text: 'Brevo SMTP is working'
    });

    res.send('Email sent');
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

module.exports = router;
