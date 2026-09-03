import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../api';

const createCrudThunks = (entityName, endpoint) => ({
  fetchAll: createAsyncThunk(
    `masterData/${entityName}/fetchAll`,
    async (_, { rejectWithValue }) => {
      try {
        const response = await api.get(`/master/${endpoint}`);
        return response.data.data;
      } catch (error) {
        return rejectWithValue(error.response?.data?.message || `Failed to fetch ${entityName}`);
      }
    }
  ),
  create: createAsyncThunk(
    `masterData/${entityName}/create`,
    async (data, { rejectWithValue }) => {
      try {
        const response = await api.post(`/master/${endpoint}`, data);
        return response.data.data;
      } catch (error) {
        return rejectWithValue(error.response?.data?.message || `Failed to create ${entityName}`);
      }
    }
  ),
  update: createAsyncThunk(
    `masterData/${entityName}/update`,
    async ({ id, data }, { rejectWithValue }) => {
      try {
        const response = await api.put(`/master/${endpoint}/${id}`, data);
        return response.data.data;
      } catch (error) {
        return rejectWithValue(error.response?.data?.message || `Failed to update ${entityName}`);
      }
    }
  ),
  remove: createAsyncThunk(
    `masterData/${entityName}/remove`,
    async (id, { rejectWithValue }) => {
      try {
        await api.delete(`/master/${endpoint}/${id}`);
        return id;
      } catch (error) {
        return rejectWithValue(error.response?.data?.message || `Failed to delete ${entityName}`);
      }
    }
  ),
});

export const customerThunks = createCrudThunks('customers', 'customers');
export const supplierThunks = createCrudThunks('suppliers', 'suppliers');
export const categoryThunks = createCrudThunks('categories', 'categories');
export const brandThunks = createCrudThunks('brands', 'brands');
export const unitThunks = createCrudThunks('units', 'units');
export const productThunks = createCrudThunks('products', 'products');

const createEntityState = () => ({
  data: [],
  loading: false,
  error: null,
});

const handleEntityReducers = (builder, thunks, entityKey) => {
  builder
    .addCase(thunks.fetchAll.pending, (state) => {
      state[entityKey].loading = true;
      state[entityKey].error = null;
    })
    .addCase(thunks.fetchAll.fulfilled, (state, action) => {
      state[entityKey].loading = false;
      state[entityKey].data = action.payload;
    })
    .addCase(thunks.fetchAll.rejected, (state, action) => {
      state[entityKey].loading = false;
      state[entityKey].error = action.payload;
    })
    // Create
    .addCase(thunks.create.fulfilled, (state, action) => {
      state[entityKey].data.unshift(action.payload);
    })
    // Update
    .addCase(thunks.update.fulfilled, (state, action) => {
      const index = state[entityKey].data.findIndex(item => item._id === action.payload._id);
      if (index !== -1) {
        state[entityKey].data[index] = action.payload;
      }
    })
    // Remove
    .addCase(thunks.remove.fulfilled, (state, action) => {
      state[entityKey].data = state[entityKey].data.filter(item => item._id !== action.payload);
    });
};

const masterDataSlice = createSlice({
  name: 'masterData',
  initialState: {
    customers: createEntityState(),
    suppliers: createEntityState(),
    categories: createEntityState(),
    brands: createEntityState(),
    units: createEntityState(),
    products: createEntityState(),
  },
  reducers: {},
  extraReducers: (builder) => {
    handleEntityReducers(builder, customerThunks, 'customers');
    handleEntityReducers(builder, supplierThunks, 'suppliers');
    handleEntityReducers(builder, categoryThunks, 'categories');
    handleEntityReducers(builder, brandThunks, 'brands');
    handleEntityReducers(builder, unitThunks, 'units');
    handleEntityReducers(builder, productThunks, 'products');
  },
});

export default masterDataSlice.reducer;
