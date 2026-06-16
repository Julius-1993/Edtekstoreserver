/**
 * Run this ONCE to create the first admin user:
 *   node seed-admin.js
 * 
 * Then log in and create other users from the Users page.
 * Delete this file after use.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const ADMIN = {
  name: 'Aako Julius',
  email: 'aakojuliusoluwanifemi@gmail.com',
  password: 'Admin@1234',
  role: 'admin',
  department: 'Administration',
  isActive: true,
  isFlagged: false
};

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  const exists = await User.findOne({ email: ADMIN.email });
  if (exists) { console.log('Admin already exists'); process.exit(0); }
  await User.create(ADMIN);
  console.log('✅ Admin created!');
  console.log('   Email:', ADMIN.email);
  console.log('   Password:', ADMIN.password);
  console.log('   Change password after first login!');
  process.exit(0);
}

seed().catch(err => { console.error(err.message); process.exit(1); });
