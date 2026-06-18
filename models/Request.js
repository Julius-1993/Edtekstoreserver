const mongoose = require('mongoose');

const requestItemSchema = new mongoose.Schema({
  stock: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock' },
  serialNumber: String,
  name: String,
  specification: String,
  category: String,
  screenSize: String,
  quantityRequested: { type: Number, required: true, min: 1 },
  quantityApproved: { type: Number, default: 0 },
  unit: String
});

const softwareItemSchema = new mongoose.Schema({
  name: {
    type: String,
    enum: ['Mozabook','Chorus','Microsoft Office','Note3','Norton','Testdriller BECE',
           'Testdriller NCE','Testdriller SSCE','Testdriller UTME','Myviewboard','Other'],
    required: true
  },
  customName: String,
  status: { type: String, enum: ['Activated','Non Activated','Nil'], default: 'Nil' },
  notes: String
});

const workflowLogSchema = new mongoose.Schema({
  stage: String,
  status: String,
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String,
  timestamp: { type: Date, default: Date.now }
});

const requestSchema = new mongoose.Schema({
  requestNumber: { type: String, unique: true },
  items: [requestItemSchema],

  toOrganization: { type: String, required: true, trim: true },
  toDepartment:   { type: String, required: true, trim: true },
  deliveryAddress: String,
  contactPerson:   String,
  contactPhone:    String,
  contactEmail:    String,

  requestedBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  technicalBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  shippedBy:            { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deliveryConfirmedBy:  String,

  status: {
    type: String,
    enum: ['draft','pending','approved','rejected','processing','shipped','confirmed','completed'],
    default: 'pending'
  },

  priority: { type: String, enum: ['low','medium','high','urgent'], default: 'medium' },

  requestNotes:    String,
  approvalNotes:   String,
  rejectionReason: String,
  technicalNotes:  String,
  shippingNotes:   String,
  deliveryNotes:   String,
  missingItemsNote: String,

  expectedDeliveryDate:  Date,
  approvedAt:            Date,
  processingStartedAt:   Date,
  shippedAt:             Date,
  confirmedAt:           Date,
  completedAt:           Date,

  // Software installation checklist added by Technical team
  softwareChecklist: [softwareItemSchema],
  softwareUpdatedAt: Date,
  softwareUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  deliveryToken:        String,
  deliveryTokenExpiry:  Date,

  // Waybill token — for sharable print URL
  waybillToken: { type: String },
  waybillNumber: { type: String },  // formatted waybill number e.g. WB-2605-0001
  emailSentAt:          Date,

  workflowLog: [workflowLogSchema]
}, { timestamps: true });

requestSchema.pre('save', async function (next) {
  if (!this.requestNumber) {
    const count = await this.constructor.countDocuments();
    const d = new Date();
    const yr = d.getFullYear().toString().slice(-2);
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    this.requestNumber = `REQ-${yr}${mo}-${String(count + 1).padStart(4, '0')}`;
    this.waybillNumber = `WB-${yr}${mo}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Request', requestSchema);
