import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../api';

export const fetchPayments = createAsyncThunk('payments/fetchAll', async (filters = {}, { rejectWithValue }) => {
  try {
    const params = new URLSearchParams(filters).toString();
    const { data } = await api.get(`/payments?${params}`);
    return data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Failed to fetch payments');
  }
});

export const createPayment = createAsyncThunk('payments/create', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/payments', payload);
    return data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Failed to create payment');
  }
});

export const reversePayment = createAsyncThunk('payments/reverse', async (paymentId, { rejectWithValue }) => {
  try {
    const { data } = await api.post(`/payments/${paymentId}/reverse`);
    return data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Failed to reverse payment');
  }
});

export const fetchUnpaidInvoices = createAsyncThunk('payments/unpaidInvoices', async (filters, { rejectWithValue }) => {  try {
    const params = new URLSearchParams(filters).toString();
    const { data } = await api.get(`/payments/unpaid?${params}`);
    return data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Failed to fetch unpaid invoices');
  }
});

export const fetchCustomerLedger = createAsyncThunk('payments/customerLedger', async ({ customerId, stream }, { rejectWithValue }) => {
  try {
    const params = stream ? `?stream=${stream}` : '';
    const { data } = await api.get(`/master/customers/${customerId}/ledger${params}`);
    return data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Failed to fetch ledger');
  }
});

export const fetchSupplierLedger = createAsyncThunk('payments/supplierLedger', async ({ supplierId, stream }, { rejectWithValue }) => {
  try {
    const params = stream ? `?stream=${stream}` : '';
    const { data } = await api.get(`/master/suppliers/${supplierId}/ledger${params}`);
    return data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Failed to fetch ledger');
  }
});

const paymentSlice = createSlice({
  name: 'payments',
  initialState: {
    data: [],
    ledger: [],
    unpaidInvoices: [],
    loading: false,
    error: null,
  },
  reducers: {
    clearPaymentError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPayments.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchPayments.fulfilled, (state, action) => { state.loading = false; state.data = action.payload; })
      .addCase(fetchPayments.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

      .addCase(createPayment.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(createPayment.fulfilled, (state, action) => { state.loading = false; state.data.unshift(action.payload); })
      .addCase(createPayment.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

      .addCase(reversePayment.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(reversePayment.fulfilled, (state, action) => {
        state.loading = false;
        const idx = state.data.findIndex((p) => p._id === action.payload._id);
        if (idx >= 0) state.data[idx] = action.payload;
      })
      .addCase(reversePayment.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

      .addCase(fetchUnpaidInvoices.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchUnpaidInvoices.fulfilled, (state, action) => { state.loading = false; state.unpaidInvoices = action.payload; })
      .addCase(fetchUnpaidInvoices.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

      .addCase(fetchCustomerLedger.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchCustomerLedger.fulfilled, (state, action) => { state.loading = false; state.ledger = action.payload; })
      .addCase(fetchCustomerLedger.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

      .addCase(fetchSupplierLedger.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchSupplierLedger.fulfilled, (state, action) => { state.loading = false; state.ledger = action.payload; })
      .addCase(fetchSupplierLedger.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export const { clearPaymentError } = paymentSlice.actions;
export default paymentSlice.reducer;
