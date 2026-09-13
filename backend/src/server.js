import dotenv from 'dotenv'; dotenv.config();
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';
import errorHandler from './middlewares/errorHandler.js';
import { globalLimiter, mutationLimiter } from './middlewares/rateLimiter.js';

// Routes
import authRoutes from './routes/authRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import masterDataRoutes from './routes/masterDataRoutes.js';
import purchaseRoutes from './routes/purchaseRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import salesRoutes from './routes/salesRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import returnsRoutes from './routes/returnsRoutes.js';
import notesRoutes from './routes/notesRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import { initBackupCron } from './jobs/backupCron.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Connect to database
connectDB().then(() => {
  // Initialize cron jobs after successful DB connection
  initBackupCron();
});

const app = express();

app.set('trust proxy', 1);

// CORS configuration
const configuredFrontendUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : '';
const allowedOrigins = [
  configuredFrontendUrl,
  'https://khm-erp.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5001',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const cleanOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(cleanOrigin) || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Fallback comparison
    if (configuredFrontendUrl && cleanOrigin === configuredFrontendUrl) {
      return callback(null, true);
    }
    return callback(null, true); // Allow all or pass matching origin with credentials
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Serve statically generated PDFs (fallback from OCI)
app.use('/pdfs', helmet.crossOriginResourcePolicy({ policy: "cross-origin" }), express.static(path.join(__dirname, '../public/pdfs')));

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'KHM ERP API is running' });
});

// Rate limiting
app.use('/api', globalLimiter);    // 300 req / 15 min per IP
// 100 write ops / 15 min per IP
app.use('/api', (req, res, next) => {
  const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (mutationMethods.includes(req.method)) {
    return mutationLimiter(req, res, next);
  }
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/master', masterDataRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit', auditRoutes);

// 404 handler for unknown routes
app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  next(error);
});

// Centralized error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});