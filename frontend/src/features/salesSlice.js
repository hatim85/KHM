import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../api';

export const fetchSales = createAsyncThunk(
  'sales/fetchAll',
  async (filters, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      if (filters?.stream) params.append('stream', filters.stream);
      if (filters?.status) params.append('status', filters.status);
      
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
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create sale bill');
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
        state.data.unshift(action.payload);
        state.createSuccess = true;
      })
      .addCase(createSale.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { resetSaleSuccess } = salesSlice.actions;
export default salesSlice.reducer;
