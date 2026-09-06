import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../api';

export const fetchSales = createAsyncThunk(
  'sales/fetchAll',
  async (filters, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      if (filters?.stream) params.append('stream', filters.stream);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.paymentStatus) params.append('paymentStatus', filters.paymentStatus);
      if (filters?.billType) params.append('billType', filters.billType);
      
      const response = await api.get(`/sales?${params.toString()}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch sales');
    }
  }
);

export const createSale = createAsyncThunk(
  'sales/create',
  async (saleData, { rejectWithValue }) => {
    try {
      const response = await api.post('/sales', saleData);
      // Full envelope: { success, data (primary), splitBills, splitOccurred }.
      // Mixed GST submissions return TWO documents (Tax Invoice + Bill of Supply).
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create sale bill');
    }
  }
);

export const convertEstimate = createAsyncThunk(
  'sales/convertEstimate',
  async (estimateId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/sales/${estimateId}/convert`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to convert estimate');
    }
  }
);

export const cancelSale = createAsyncThunk(
  'sales/cancel',
  async (saleId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/sales/${saleId}/cancel`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to cancel sale');
    }
  }
);

const salesSlice = createSlice({
  name: 'sales',
  initialState: {
    data: [],
    loading: false,
    error: null,
    createSuccess: false,
  },
  reducers: {
    resetSaleSuccess: (state) => {
      state.createSuccess = false;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSales.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSales.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchSales.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(createSale.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.createSuccess = false;
      })
      .addCase(createSale.fulfilled, (state, action) => {
        state.loading = false;
        // A mixed GST submission creates two documents — keep both in the list.
        const bills = action.payload?.splitBills
          || (action.payload?.data ? [action.payload.data] : []);
        for (let i = bills.length - 1; i >= 0; i -= 1) {
          state.data.unshift(bills[i]);
        }
        state.createSuccess = true;
      })
      .addCase(createSale.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(convertEstimate.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(convertEstimate.fulfilled, (state, action) => {
        state.loading = false;
        const bills = action.payload?.splitBills
          || (action.payload?.data ? [action.payload.data] : []);
        for (let i = bills.length - 1; i >= 0; i -= 1) {
          state.data.unshift(bills[i]);
        }
      })
      .addCase(convertEstimate.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(cancelSale.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(cancelSale.fulfilled, (state, action) => {
        state.loading = false;
        const idx = state.data.findIndex((s) => s._id === action.payload._id);
        if (idx >= 0) state.data[idx] = action.payload;
      })
      .addCase(cancelSale.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { resetSaleSuccess } = salesSlice.actions;
export default salesSlice.reducer;
