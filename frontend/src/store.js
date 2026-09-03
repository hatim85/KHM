import { configureStore } from '@reduxjs/toolkit';
import authReducer from './features/authSlice';
import settingsReducer from './features/settingsSlice';
import masterDataReducer from './features/masterDataSlice';
import purchaseReducer from './features/purchaseSlice';
import inventoryReducer from './features/inventorySlice';
import salesReducer from './features/salesSlice';
import paymentReducer from './features/paymentSlice';
import expenseReducer from './features/expenseSlice';
import auditReducer from './features/auditSlice';
import { reportApi } from './features/reportApi';

const store = configureStore({
  reducer: {
    auth: authReducer,
    settings: settingsReducer,
    masterData: masterDataReducer,
    purchases: purchaseReducer,
    inventory: inventoryReducer,
    sales: salesReducer,
    payments: paymentReducer,
    expenses: expenseReducer,
    audit: auditReducer,
    [reportApi.reducerPath]: reportApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(reportApi.middleware),
  devTools: process.env.NODE_ENV !== 'production',
});

export default store;
