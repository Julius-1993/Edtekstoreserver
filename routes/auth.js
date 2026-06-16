const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { sendStatusEmail } = require('../utils/email');

const router = express.Router();
const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// Admin creates user — only login is public
router.post('/create-user', protect, authorize('admin'), async (req, res) => {
  try {
    const { name, email, password, role, department, phone } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Name, email, password and role are required' });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });
    const user = await User.create({ name, email, password, role, department, phone, createdBy: req.user._id });
    // notify new user
    try {
      await sendStatusEmail({
        recipientEmail: email,
        subject: 'Your EDTEK StoreTrack Account',
        message: `<p>Hello <strong>${name}</strong>,</p><p>Your account has been created on <strong>EDTEK StoreTrack</strong>.</p><p><strong>Email:</strong> ${email}<br><strong>Role:</strong> ${role}<br><strong>Temporary Password:</strong> ${password}</p><p>Please log in and keep your credentials safe.</p>`,
        requestNumber: 'ACCOUNT'
      });
    } catch (e) { console.error('Welcome email error:', e.message); }
    res.status(201).json({ success: true, user });
  } catch (err) {
    console.error('Create user error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (!user.isActive) return res.status(401).json({ success: false, message: 'Account deactivated. Contact admin.' });
    if (user.isFlagged) return res.status(401).json({ success: false, message: 'Account flagged. Contact admin.' });
    // log activity
    user.lastLogin = new Date();
    user.activityLog.push({ action: 'login', details: 'User logged in', timestamp: new Date() });
    if (user.activityLog.length > 100) user.activityLog = user.activityLog.slice(-100);
    await user.save();
    const token = signToken(user._id);
    res.json({ success: true, token, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get current user
router.get('/me', protect, (req, res) => res.json({ success: true, user: req.user }));

// Get all users (admin only)
router.get('/users', protect, authorize('admin'), async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .populate('createdBy', 'name email')
      .populate('flaggedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single user (admin)
router.get('/users/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('createdBy flaggedBy', 'name email');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update user (admin)
router.put('/users/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const { name, email, role, department, phone, isActive } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (name)  user.name  = name;
    if (email) user.email = email;
    if (role)  user.role  = role;
    if (department !== undefined) user.department = department;
    if (phone !== undefined)      user.phone = phone;
    if (isActive !== undefined)   user.isActive = isActive;
    user.activityLog.push({ action: 'profile_updated', details: `Updated by admin`, timestamp: new Date() });
    await user.save();
    res.json({ success: true, user: user.toJSON() });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Reset user password (admin)
router.put('/users/:id/reset-password', protect, authorize('admin'), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.password = newPassword;
    user.activityLog.push({ action: 'password_reset', details: 'Password reset by admin', timestamp: new Date() });
    await user.save();
    try {
      await sendStatusEmail({
        recipientEmail: user.email,
        subject: 'Your EDTEK StoreTrack Password Has Been Reset',
        message: `<p>Hello <strong>${user.name}</strong>,</p><p>Your password has been reset by an administrator.</p><p><strong>New Password:</strong> ${newPassword}</p><p>Please log in and change your password immediately.</p>`,
        requestNumber: 'PWD-RESET'
      });
    } catch (e) { console.error('Password reset email error:', e.message); }
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Flag user (admin)
router.put('/users/:id/flag', protect, authorize('admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot flag yourself' });
    }
    user.isFlagged = !user.isFlagged;
    user.flagReason = user.isFlagged ? reason : undefined;
    user.flaggedAt  = user.isFlagged ? new Date() : undefined;
    user.flaggedBy  = user.isFlagged ? req.user._id : undefined;
    if (user.isFlagged) user.isActive = false;
    user.activityLog.push({ action: user.isFlagged ? 'flagged' : 'unflagged', details: reason || '', timestamp: new Date() });
    await user.save();
    res.json({ success: true, user: user.toJSON(), message: user.isFlagged ? 'User flagged' : 'User unflagged' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete user (admin)
router.delete('/users/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot delete yourself' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpiry = Date.now() + 60 * 60 * 1000;
    await user.save();
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await sendStatusEmail({
      recipientEmail: user.email,
      subject: 'Password Reset — EDTEK StoreTrack',
      message: `<p>You requested a password reset.</p><p style="margin:24px 0;"><a href="${resetUrl}" style="background:#0a1628;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;">Reset My Password</a></p><p style="color:#64748b;font-size:13px;">Expires in 1 hour.</p><p style="color:#64748b;font-size:12px;margin-top:12px;">Link: ${resetUrl}</p>`,
      requestNumber: 'PWD-RESET'
    });
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send reset email' });
  }
});

// Reset password
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({ resetPasswordToken: hashed, resetPasswordExpiry: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: 'Reset link invalid or expired' });
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiry = undefined;
    await user.save();
    const token = signToken(user._id);
    res.json({ success: true, message: 'Password reset successful!', token, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
