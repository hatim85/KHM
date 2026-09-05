import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../api';

export const fetchSettings = createAsyncThunk(
  'settings/fetchSettings',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/settings');
      return response.data.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch settings'
      );
    }
  }
);

export const updateSettings = createAsyncThunk(
  'settings/updateSettings',
  async (settingsData, { rejectWithValue }) => {
    try {
      const response = await api.put('/settings', settingsData);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update settings'
      );
    }
  }
);

export const updateBusinessSettings = createAsyncThunk(
  'settings/updateBusinessSettings',
  async (businessData, { rejectWithValue }) => {
    try {
      const response = await api.put('/settings/business', businessData);
      return { data: response.data.data, section: 'business' };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update business details'
      );
    }
  }
);

export const updateSequenceSettings = createAsyncThunk(
  'settings/updateSequenceSettings',
  async (sequenceData, { rejectWithValue }) => {
    try {
      const response = await api.put('/settings/sequences', sequenceData);
      return { data: response.data.data, section: 'sequences' };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update document sequences'
      );
    }
  }
);
export const triggerBackup = createAsyncThunk(
  'settings/triggerBackup',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.post('/settings/backup');
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to trigger backup'
      );
    }
  }
);

const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    data: null,
    loading: false,
    error: null,
    updateSuccess: false,
    backupLoading: false,
    backupResult: null,
  },
  reducers: {
    clearSettingsError: (state) => {
      state.error = null;
    },
    resetUpdateSuccess: (state) => {
      state.updateSuccess = false;
    },
    clearBackupResult: (state) => {
      state.backupResult = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch settings
      .addCase(fetchSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Update settings
      .addCase(updateSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.updateSuccess = false;
      })
      .addCase(updateSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
        state.updateSuccess = true;
      })
      .addCase(updateSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Update business details (independent lifecycle)
      .addCase(updateBusinessSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.updateSuccess = false;
      })
      .addCase(updateBusinessSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload.data;
        state.updateSuccess = true;
      })
      .addCase(updateBusinessSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Update document sequences (independent lifecycle, admin-only)
      .addCase(updateSequenceSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.updateSuccess = false;
      })
      .addCase(updateSequenceSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload.data;
        state.updateSuccess = true;
      })
      .addCase(updateSequenceSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Trigger backup
      .addCase(triggerBackup.pending, (state) => {
        state.backupLoading = true;
        state.backupResult = null;
        state.error = null;
      })
      .addCase(triggerBackup.fulfilled, (state, action) => {
        state.backupLoading = false;
        state.backupResult = { success: true, message: action.payload.message };
      })
      .addCase(triggerBackup.rejected, (state, action) => {
        state.backupLoading = false;
        state.backupResult = { success: false, message: action.payload };
      });
  },
});

export const { clearSettingsError, resetUpdateSuccess, clearBackupResult } = settingsSlice.actions;
export default settingsSlice.reducer;
