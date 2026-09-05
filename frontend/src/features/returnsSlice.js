import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../api';

export const fetchReturns = createAsyncThunk(
  'returns/fetchAll',
  async (filters = {}, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams(filters).toString();
      const response = await api.get(`/returns?${params}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch returns');
    }
  }
);

export const createSalesReturn = createAsyncThunk(
  'returns/createSales',
  async (payload, { rejectWithValue }) => {
    try {
      const response = await api.post('/returns/sales', payload);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create sales return');
    }
  }
);

export const createPurchaseReturn = createAsyncThunk(
  'returns/createPurchase',
  async (payload, { rejectWithValue }) => {
    try {
      const response = await api.post('/returns/purchases', payload);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create purchase return');
    }
  }
);

export const fetchReturnable = createAsyncThunk(
  'returns/fetchReturnable',
  async ({ model, id }, { rejectWithValue }) => {
    try {
      const response = await api.get(`/returns/returnable/${model}/${id}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch returnable quantities');
    }
  }
);

const returnsSlice = createSlice({
  name: 'returns',
  initialState: {
    data: [],
    returnable: null,
    loading: false,
    error: null,
  },
  reducers: {
    clearReturnsError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReturns.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchReturns.fulfilled, (state, action) => { state.loading = false; state.data = action.payload; })
      .addCase(fetchReturns.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(createSalesReturn.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(createSalesReturn.fulfilled, (state, action) => { state.loading = false; state.data.unshift(action.payload); })
      .addCase(createSalesReturn.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(createPurchaseReturn.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(createPurchaseReturn.fulfilled, (state, action) => { state.loading = false; state.data.unshift(action.payload); })
      .addCase(createPurchaseReturn.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(fetchReturnable.pending, (state) => { state.loading = true; state.error = null; state.returnable = null; })
      .addCase(fetchReturnable.fulfilled, (state, action) => { state.loading = false; state.returnable = action.payload; })
      .addCase(fetchReturnable.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export const { clearReturnsError } = returnsSlice.actions;
export default returnsSlice.reducer;
