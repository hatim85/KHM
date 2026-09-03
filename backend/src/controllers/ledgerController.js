import CustomerLedger from '../models/CustomerLedger.js';
import SupplierLedger from '../models/SupplierLedger.js';

export const getCustomerLedger = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const { stream } = req.query; // TAX or ESTIMATE
    
    let query = CustomerLedger.find({ customer: customerId });
    if (stream) {
      query = query.where('stream').equals(stream);
    }

    const ledger = await query
      .populate('referenceDocument')
      .sort({ createdAt: 1 }); // Oldest first for running balance view

    res.json({ success: true, count: ledger.length, data: ledger });
  } catch (error) {
    next(error);
  }
};

export const getSupplierLedger = async (req, res, next) => {
  try {
    const { supplierId } = req.params;
    const { stream } = req.query; // TAX or ESTIMATE
    
    let query = SupplierLedger.find({ supplier: supplierId });
    if (stream) {
      query = query.where('stream').equals(stream);
    }

    const ledger = await query
      .populate('referenceDocument')
      .sort({ createdAt: 1 }); // Oldest first for running balance view

    res.json({ success: true, count: ledger.length, data: ledger });
  } catch (error) {
    next(error);
  }
};
