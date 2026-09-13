import rateLimit from 'express-rate-limit';

/**
 * Standard 429 response handler for all rate limiters.
 * Produces a response shape consistent with ApiError / errorHandler.
 */
const rateLimitHandler = (req, res) => {
  res.status(429).json({
    success: false,
    message: 'Too many requests, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  });
};

// ─── Global Limiter ─────────────────────────────────────────────────────────
// Applies to every /api/* request. 300 req / 15 min per IP.
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// ─── Auth: Login ─────────────────────────────────────────────────────────────
// 10 req / 15 min — brute-force protection for credential guessing.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// ─── Auth: Forgot Password ──────────────────────────────────────────────────
// 5 req / 15 min — prevents email-bomb via OTP requests.
export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// ─── Auth: Verify OTP ───────────────────────────────────────────────────────
// 10 req / 15 min — prevents OTP brute-force guessing.
export const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// ─── Auth: Reset Password ───────────────────────────────────────────────────
// 5 req / 15 min — prevents reset-token abuse.
export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// ─── Mutation Limiter ───────────────────────────────────────────────────────
// 100 write operations / 15 min per IP.
// Only counts POST, PUT, PATCH, DELETE — GETs pass through freely.
export const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET',
  handler: rateLimitHandler,
});

// ─── Reports Limiter ────────────────────────────────────────────────────────
// 60 req / 15 min — report queries can be DB-heavy.
export const reportsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// ─── PDF Generation Limiter ─────────────────────────────────────────────────
// 20 req / 15 min — PDF rendering is CPU-intensive (Puppeteer).
export const pdfLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// ─── Manual Backup Limiter ──────────────────────────────────────────────────
// 2 req / 1 hour — backups are expensive operations.
export const backupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
