const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const activitySchema = new mongoose.Schema({
  action: String,
  details: String,
  ip: String,
  timestamp: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role: {
    type: String,
    enum: ['admin', 'storekeeper', 'sales', 'technical'],
    required: true
  },
  department: { type: String, trim: true },
  phone: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  isFlagged: { type: Boolean, default: false },
  flagReason: { type: String },
  flaggedAt: { type: Date },
  flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastLogin: { type: Date },
  lastLoginIp: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  activityLog: [activitySchema],
  resetPasswordToken: String,
  resetPasswordExpiry: Date
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
