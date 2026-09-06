import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../api';

export const fetchNotes = createAsyncThunk(
  'notes/fetchAll',
  async (filters, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      if (filters?.noteType) params.append('noteType', filters.noteType);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.partyId) params.append('partyId', filters.partyId);
      const response = await api.get(`/notes?${params.toString()}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch notes');
    }
  }
);

export const fetchNoteOriginals = createAsyncThunk(
  'notes/fetchOriginals',
  async ({ partyType, partyId }, { rejectWithValue }) => {
    try {
      const response = await api.get(`/notes/originals?partyType=${partyType}&partyId=${partyId}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch original documents');
    }
  }
);

export const createNote = createAsyncThunk(
  'notes/create',
  async (noteData, { rejectWithValue }) => {
    try {
      const response = await api.post('/notes', noteData);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create note');
    }
  }
);

export const cancelNote = createAsyncThunk(
  'notes/cancel',
  async (noteId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/notes/${noteId}/cancel`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to cancel note');
    }
  }
);

const notesSlice = createSlice({
  name: 'notes',
  initialState: {
    data: [],
    originals: [],
    loading: false,
    error: null,
    createSuccess: false,
  },
  reducers: {
    resetNoteSuccess: (state) => {
      state.createSuccess = false;
    },
    clearOriginals: (state) => {
      state.originals = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotes.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotes.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchNotes.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchNoteOriginals.fulfilled, (state, action) => {
        state.originals = action.payload;
      })
      .addCase(fetchNoteOriginals.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(createNote.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.createSuccess = false;
      })
      .addCase(createNote.fulfilled, (state, action) => {
        state.loading = false;
        state.data.unshift(action.payload);
        state.createSuccess = true;
      })
      .addCase(createNote.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(cancelNote.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(cancelNote.fulfilled, (state, action) => {
        state.loading = false;
        const idx = state.data.findIndex((n) => n._id === action.payload._id);
        if (idx >= 0) state.data[idx] = action.payload;
      })
      .addCase(cancelNote.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { resetNoteSuccess, clearOriginals } = notesSlice.actions;
export default notesSlice.reducer;
