import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../api';

export const fetchPurchases = createAsyncThunk(
  'purchases/fetchAll',
  async (filters, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      if (filters?.stream) params.append('stream', filters.stream);
      if (filters?.status) params.append('status', filters.status);
      
      const response = await api.get(`/purchases?${params.toString()}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch purchases');
    }
  }
);

export const createPurchase = createAsyncThunk(
  'purchases/create',
  async (purchaseData, { rejectWithValue }) => {
    try {
      const response = await api.post('/purchases', purchaseData);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create purchase');
    }
  }
);

const purchaseSlice = createSlice({
  name: 'purchases',
  initialState: {
    data: [],
    loading: false,
    error: null,
    createSuccess: false,
  },
  reducers: {
    resetPurchaseSuccess: (state) => {
      state.createSuccess = false;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPurchases.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPurchases.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchPurchases.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(createPurchase.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.createSuccess = false;
      })
      .addCase(createPurchase.fulfilled, (state, action) => {
        state.loading = false;
        state.data.unshift(action.payload);
        state.createSuccess = true;
      })
      .addCase(createPurchase.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { resetPurchaseSuccess } = purchaseSlice.actions;
export default purchaseSlice.reducer;
