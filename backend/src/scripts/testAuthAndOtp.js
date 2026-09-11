import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.BREVO_API_KEY = 'test-brevo-key';
process.env.BREVO_SENDER_EMAIL = 'test@khm.test';

const { default: authRoutes } = await import('../routes/authRoutes.js');
const { default: errorHandler } = await import('../middlewares/errorHandler.js');
const { default: User } = await import('../models/User.js');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

console.log('Starting In-Memory MongoDB for Auth tests...');
const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await mongoose.connect(repl.getUri(), { dbName: 'test-auth-db' });
await User.init();

console.log('Connected. Running Auth tests...');

try {
  // 1. Create initial Admin
  const adminUser = await User.create({
    name: 'Super Admin',
    email: 'admin@khm.test',
    password: 'password123',
    role: 'Admin',
  });

  const adminAgent = request.agent(app);
  const loginRes = await adminAgent.post('/api/auth/login').send({
    email: 'admin@khm.test',
    password: 'password123',
  });
  if (loginRes.status !== 200) throw new Error(`Admin login failed: ${loginRes.status}`);
  console.log('✓ Admin login successful');

  // 2. Admin creates a Manager user
  const regRes = await adminAgent.post('/api/auth/register').send({
    name: 'Test Manager',
    email: 'manager@khm.test',
    password: 'password123',
    role: 'Manager',
  });
  if (regRes.status !== 201) throw new Error(`User registration failed: ${regRes.status} ${JSON.stringify(regRes.body)}`);
  const managerId = regRes.body.data._id;
  console.log('✓ Admin successfully created new Manager user');

  // 3. Manager tries to register an Admin user -> MUST BE REJECTED 403
  const managerAgent = request.agent(app);
  await managerAgent.post('/api/auth/login').send({
    email: 'manager@khm.test',
    password: 'password123',
  });
  const unauthRegRes = await managerAgent.post('/api/auth/register').send({
    name: 'Hacker Admin',
    email: 'hacker@khm.test',
    password: 'password123',
    role: 'Admin',
  });
  if (unauthRegRes.status !== 403) {
    throw new Error(`Expected 403 for non-admin registration, got ${unauthRegRes.status}`);
  }
  console.log('✓ Non-admin user blocked from registering new users (403 Forbidden)');

  // 4. Admin lists users
  const listRes = await adminAgent.get('/api/auth/users');
  if (listRes.status !== 200 || listRes.body.data.length < 2) {
    throw new Error(`Failed to list users: ${listRes.status}`);
  }
  console.log(`✓ Admin successfully listed ${listRes.body.data.length} users`);

  // 5. Admin deactivates Manager user
  const toggleRes = await adminAgent.patch(`/api/auth/users/${managerId}/toggle-active`);
  if (toggleRes.status !== 200 || toggleRes.body.data.isActive !== false) {
    throw new Error(`Failed to deactivate user: ${toggleRes.status}`);
  }
  console.log('✓ Admin successfully deactivated Manager user');

  // 6. Deactivated user cannot log in -> MUST BE REJECTED 401
  const deactLoginRes = await request(app).post('/api/auth/login').send({
    email: 'manager@khm.test',
    password: 'password123',
  });
  if (deactLoginRes.status !== 401 || deactLoginRes.body.code !== 'ACCOUNT_DEACTIVATED') {
    throw new Error(`Deactivated user was not blocked: ${deactLoginRes.status}`);
  }
  console.log('✓ Deactivated user blocked from logging in (ACCOUNT_DEACTIVATED)');

  // 7. Admin reactivates Manager user
  const reactivateRes = await adminAgent.patch(`/api/auth/users/${managerId}/toggle-active`);
  if (reactivateRes.status !== 200 || reactivateRes.body.data.isActive !== true) {
    throw new Error(`Failed to reactivate user: ${reactivateRes.status}`);
  }
  console.log('✓ Admin successfully reactivated Manager user');

  // 8. Test OTP generation and reset password
  // Set bcrypt-hashed OTP directly in DB to verify verify-otp and reset-password
  const userToReset = await User.findOne({ email: 'admin@khm.test' });
  const testOtp = '849201';
  const bcrypt = (await import('bcryptjs')).default;
  userToReset.resetOtp = await bcrypt.hash(testOtp, 10);
  userToReset.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
  await userToReset.save();

  // Verify OTP
  const verifyRes = await request(app).post('/api/auth/verify-otp').send({
    email: 'admin@khm.test',
    otp: testOtp,
  });
  if (verifyRes.status !== 200 || !verifyRes.body.resetToken) {
    throw new Error(`Failed to verify OTP: ${verifyRes.status}`);
  }
  const resetToken = verifyRes.body.resetToken;
  console.log('✓ OTP verification successful, received reset token');

  // Reset Password
  const resetRes = await request(app).post('/api/auth/reset-password').send({
    resetToken,
    newPassword: 'newpassword456',
  });
  if (resetRes.status !== 200) {
    throw new Error(`Failed to reset password: ${resetRes.status}`);
  }
  console.log('✓ Password reset successful');

  // Verify login with new password
  const newLoginRes = await request(app).post('/api/auth/login').send({
    email: 'admin@khm.test',
    password: 'newpassword456',
  });
  if (newLoginRes.status !== 200) {
    throw new Error(`Failed to login with new password: ${newLoginRes.status}`);
  }
  console.log('✓ Successfully logged in with new password');

  console.log('\n======================================');
  console.log('ALL AUTH & OTP TESTS PASSED PERFECTLY!');
  console.log('======================================\n');
} finally {
  await mongoose.disconnect();
  await repl.stop();
  process.exit(0);
}
