import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../api';

export const fetchAuditLogs = createAsyncThunk('audit/fetchAll', async (filters = {}, { rejectWithValue }) => {
  try {
    const params = new URLSearchParams(filters).toString();
    const { data } = await api.get(`/audit?${params}`);
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Failed to fetch audit logs');
  }
});

const auditSlice = createSlice({
  name: 'audit',
  initialState: {
    data: [],
    total: 0,
    page: 1,
    pages: 1,
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAuditLogs.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchAuditLogs.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload.data;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.pages = action.payload.pages;
      })
      .addCase(fetchAuditLogs.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export default auditSlice.reducer;
