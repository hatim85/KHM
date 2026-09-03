/**
 * Seed script to create the initial Admin user.
 * Run once: node src/scripts/seedAdmin.js
 * 
 * This creates the first admin account that can then
 * create other internal users via the /api/auth/register endpoint.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });
import mongoose from 'mongoose';
import User from '../models/User.js';
import connectDB from '../config/db.js';

const seedAdmin = async () => {
  try {
    await connectDB();

    const existingAdmin = await User.findOne({ email: 'kutbihardwaremart.sales@gmail.com' });

    if (existingAdmin) {
      console.log('Admin user already exists. Skipping seed.');
      process.exit(0);
    }

    const admin = await User.create({
      name: 'KHM Admin',
      email: 'kutbihardwaremart.sales@gmail.com',
      password: 'khm@2004',
      role: 'Admin',
      permissions: [], // Admin role bypasses permission checks
      isActive: true,
    });

    console.log('Admin user created successfully:');
    console.log(`  Email: ${admin.email}`);
    console.log(`  Password: admin123456`);
    console.log('');
    console.log('⚠️  IMPORTANT: Change this password immediately after first login!');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error.message);
    process.exit(1);
  }
};

seedAdmin();
