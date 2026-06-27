const express = require('express');
const Request = require('../models/Request');
const { protect } = require('../middleware/auth');
const { sendStatusEmail } = require('../utils/email');
const router = express.Router();

// Public: verify token
router.get('/confirm/:token', async (req, res) => {
  try {
    const request = await Request.findOne({
      deliveryToken: req.params.token,
      deliveryTokenExpiry: { $gt: new Date() }
    }).populate('requestedBy', 'name email')
      .populate('softwareUpdatedBy', 'name email');
    if (!request) return res.status(400).json({ success: false, message: 'Link invalid or expired. Contact the store to resend.' });
    if (['confirmed','completed'].includes(request.status)) {
      return res.json({ success: true, alreadyConfirmed: true, request: { requestNumber: request.requestNumber, toOrganization: request.toOrganization, confirmedAt: request.confirmedAt } });
    }
    res.json({ success: true, request });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Public: submit confirmation
router.post('/confirm/:token', async (req, res) => {
  try {
    const { deliveryNotes, missingItemsNote, confirmedBy } = req.body;
    const request = await Request.findOne({
      deliveryToken: req.params.token,
      deliveryTokenExpiry: { $gt: new Date() }
    }).populate('requestedBy approvedBy technicalBy', 'name email');
    if (!request) return res.status(400).json({ success: false, message: 'Link invalid or expired' });
    if (['confirmed','completed'].includes(request.status)) return res.status(400).json({ success: false, message: 'Already confirmed' });
    request.status = 'confirmed';
    request.deliveryNotes = deliveryNotes;
    request.missingItemsNote = missingItemsNote;
    request.deliveryConfirmedBy = confirmedBy;
    request.confirmedAt = new Date();
    request.deliveryToken = undefined;
    request.deliveryTokenExpiry = undefined;
    request.workflowLog.push({ stage:'Delivery Confirmed', status:'confirmed', notes:`Confirmed by ${confirmedBy}${missingItemsNote ? ' — Missing: ' + missingItemsNote : ''}` });
    await request.save();
    const notifyEmail = request.technicalBy?.email || request.approvedBy?.email;
    if (notifyEmail) {
      try {
        await sendStatusEmail({ recipientEmail:notifyEmail, subject:`Delivery Confirmed — ${request.requestNumber}`, message:`Request <strong>#${request.requestNumber}</strong> to <strong>${request.toOrganization}</strong> has been <span style="color:#16a34a;font-weight:700;">confirmed as delivered</span> by <strong>${confirmedBy}</strong>.${missingItemsNote ? `<br><br><strong style="color:#dc2626;">Missing Items:</strong> ${missingItemsNote}` : ''}`, requestNumber:request.requestNumber });
      } catch(e){ console.error('Email:', e.message); }
    }
    res.json({ success: true, message: 'Delivery confirmed!', request: { requestNumber: request.requestNumber, confirmedAt: request.confirmedAt } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Protected: list deliveries
router.get('/', protect, async (req, res) => {
  try {
    const { status } = req.query;
    const query = { status: { $in: ['approved','processing','shipped','confirmed','completed'] } };
    if (status) query.status = status;
    const requests = await Request.find(query)
      .populate('requestedBy', 'name email department')
      .populate('approvedBy technicalBy shippedBy softwareUpdatedBy', 'name email')
      .sort({ updatedAt: -1 });
    res.json({ success: true, requests });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
