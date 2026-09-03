import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../api';

export const fetchStockMovements = createAsyncThunk(
  'inventory/fetchMovements',
  async (filters, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      if (filters?.stream) params.append('stream', filters.stream);
      if (filters?.product) params.append('product', filters.product);
      if (filters?.type) params.append('type', filters.type);
      
      const response = await api.get(`/inventory/movements?${params.toString()}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch stock movements');
    }
  }
);

export const fetchLowStock = createAsyncThunk(
  'inventory/fetchLowStock',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/inventory/low-stock');
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch low stock alerts');
    }
  }
);

export const adjustStock = createAsyncThunk(
  'inventory/adjustStock',
  async (adjustmentData, { rejectWithValue }) => {
    try {
      const response = await api.post('/inventory/adjust', adjustmentData);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to adjust stock');
    }
  }
);

const inventorySlice = createSlice({
  name: 'inventory',
  initialState: {
    movements: [],
    lowStock: [],
    movementsLoading: false,
    lowStockLoading: false,
    adjustLoading: false,
    error: null,
    adjustSuccess: false,
  },
  reducers: {
    resetAdjustSuccess: (state) => {
      state.adjustSuccess = false;
    },
    clearInventoryError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Movements
      .addCase(fetchStockMovements.pending, (state) => {
        state.movementsLoading = true;
        state.error = null;
      })
      .addCase(fetchStockMovements.fulfilled, (state, action) => {
        state.movementsLoading = false;
        state.movements = action.payload;
      })
      .addCase(fetchStockMovements.rejected, (state, action) => {
        state.movementsLoading = false;
        state.error = action.payload;
      })
      // Low Stock
      .addCase(fetchLowStock.pending, (state) => {
        state.lowStockLoading = true;
      })
      .addCase(fetchLowStock.fulfilled, (state, action) => {
        state.lowStockLoading = false;
        state.lowStock = action.payload;
      })
      .addCase(fetchLowStock.rejected, (state, action) => {
        state.lowStockLoading = false;
        state.error = action.payload;
      })
      // Adjust
      .addCase(adjustStock.pending, (state) => {
        state.adjustLoading = true;
        state.error = null;
        state.adjustSuccess = false;
      })
      .addCase(adjustStock.fulfilled, (state) => {
        state.adjustLoading = false;
        state.adjustSuccess = true;
      })
      .addCase(adjustStock.rejected, (state, action) => {
        state.adjustLoading = false;
        state.error = action.payload;
      });
  },
});

export const { resetAdjustSuccess, clearInventoryError } = inventorySlice.actions;
export default inventorySlice.reducer;
