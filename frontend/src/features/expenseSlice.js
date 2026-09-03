import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../api';

// --- Thunks for Expense Categories ---

export const fetchExpenseCategories = createAsyncThunk(
  'expenses/fetchCategories',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/expenses/categories');
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch categories');
    }
  }
);

export const createExpenseCategory = createAsyncThunk(
  'expenses/createCategory',
  async (categoryData, { rejectWithValue }) => {
    try {
      const response = await api.post('/expenses/categories', categoryData);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create category');
    }
  }
);

export const updateExpenseCategory = createAsyncThunk(
  'expenses/updateCategory',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/expenses/categories/${id}`, data);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update category');
    }
  }
);

export const deleteExpenseCategory = createAsyncThunk(
  'expenses/deleteCategory',
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/expenses/categories/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete category');
    }
  }
);


// --- Thunks for Expenses ---

export const fetchExpenses = createAsyncThunk(
  'expenses/fetchExpenses',
  async (filters, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams(filters).toString();
      const response = await api.get(`/expenses?${params}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch expenses');
    }
  }
);

export const createExpense = createAsyncThunk(
  'expenses/createExpense',
  async (expenseData, { rejectWithValue }) => {
    try {
      const response = await api.post('/expenses', expenseData);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create expense');
    }
  }
);

export const updateExpense = createAsyncThunk(
  'expenses/updateExpense',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/expenses/${id}`, data);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update expense');
    }
  }
);

export const deleteExpense = createAsyncThunk(
  'expenses/deleteExpense',
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/expenses/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete expense');
    }
  }
);


// --- Slice ---

const expenseSlice = createSlice({
  name: 'expenses',
  initialState: {
    categories: {
      data: [],
      loading: false,
      error: null,
    },
    expensesList: {
      data: [],
      loading: false,
      error: null,
    }
  },
  reducers: {},
  extraReducers: (builder) => {
    // Categories
    builder
      .addCase(fetchExpenseCategories.pending, (state) => {
        state.categories.loading = true;
        state.categories.error = null;
      })
      .addCase(fetchExpenseCategories.fulfilled, (state, action) => {
        state.categories.loading = false;
        state.categories.data = action.payload;
      })
      .addCase(fetchExpenseCategories.rejected, (state, action) => {
        state.categories.loading = false;
        state.categories.error = action.payload;
      })
      .addCase(createExpenseCategory.fulfilled, (state, action) => {
        state.categories.data.push(action.payload);
        state.categories.data.sort((a, b) => a.name.localeCompare(b.name));
      })
      .addCase(updateExpenseCategory.fulfilled, (state, action) => {
        const index = state.categories.data.findIndex(c => c._id === action.payload._id);
        if (index !== -1) {
          state.categories.data[index] = action.payload;
        }
      })
      .addCase(deleteExpenseCategory.fulfilled, (state, action) => {
        state.categories.data = state.categories.data.filter(c => c._id !== action.payload);
      });

    // Expenses
    builder
      .addCase(fetchExpenses.pending, (state) => {
        state.expensesList.loading = true;
        state.expensesList.error = null;
      })
      .addCase(fetchExpenses.fulfilled, (state, action) => {
        state.expensesList.loading = false;
        state.expensesList.data = action.payload;
      })
      .addCase(fetchExpenses.rejected, (state, action) => {
        state.expensesList.loading = false;
        state.expensesList.error = action.payload;
      })
      .addCase(createExpense.fulfilled, (state, action) => {
        state.expensesList.data.unshift(action.payload); // prepend latest
      })
      .addCase(updateExpense.fulfilled, (state, action) => {
        const index = state.expensesList.data.findIndex(e => e._id === action.payload._id);
        if (index !== -1) {
          state.expensesList.data[index] = action.payload;
        }
      })
      .addCase(deleteExpense.fulfilled, (state, action) => {
        state.expensesList.data = state.expensesList.data.filter(e => e._id !== action.payload);
      });
  }
});

export default expenseSlice.reducer;
