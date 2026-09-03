import AuditLog from '../models/AuditLog.js';

/**
 * Log an audit event. Fire-and-forget — never blocks or crashes the caller.
 *
 * @param {Object} opts
 * @param {string} opts.action   - e.g. 'SALE_CREATED', 'PAYMENT_CREATED'
 * @param {string} opts.entity   - e.g. 'Sale', 'Payment'
 * @param {ObjectId} opts.entityId
 * @param {ObjectId} opts.userId
 * @param {string} opts.summary  - Human-readable description
 * @param {Object} [opts.metadata] - Structured snapshot
 * @param {string} [opts.ipAddress]
 */
export const logAudit = async ({ action, entity, entityId, userId, summary, metadata = {}, ipAddress = '' }) => {
  try {
    await AuditLog.create({ action, entity, entityId, user: userId, summary, metadata, ipAddress });
  } catch (err) {
    // Audit logging must never crash the application
    console.error('[AuditLog] Failed to write audit log:', err.message);
  }
};
