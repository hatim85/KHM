import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { fetchCurrentUser } from './features/authSlice';

import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Products from './pages/Products';
import Purchases from './pages/Purchases';
import PurchaseForm from './pages/PurchaseForm';
import EstimatedBills from './pages/EstimatedBills';
import NewEstimatedBill from './pages/NewEstimatedBill';
import TaxBills from './pages/TaxBills';
import NewTaxBill from './pages/NewTaxBill';
import StockMovements from './pages/StockMovements';
import Payments from './pages/Payments';
import LedgerView from './pages/LedgerView';
import MasterAttributes from './pages/MasterAttributes';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import AuditLogs from './pages/AuditLogs';

function App() {
  const dispatch = useDispatch();

  useEffect(() => {
    // Check if there is an active session cookie on app load
    dispatch(fetchCurrentUser());
  }, [dispatch]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Login Route */}
        <Route path="/login" element={<Login />} />

        {/* Protected ERP Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          
          <Route path="sales">
            <Route path="tax" element={<TaxBills />} />
            <Route path="tax/new" element={<NewTaxBill />} />
            <Route path="estimate" element={<EstimatedBills />} />
            <Route path="estimate/new" element={<NewEstimatedBill />} />
          </Route>
          
          <Route path="purchases">
            <Route index element={<Purchases />} />
            <Route path="new" element={<PurchaseForm />} />
          </Route>

          <Route path="inventory">
            <Route index element={<Products />} />
            <Route path="movements" element={<StockMovements />} />
            <Route path="master" element={<MasterAttributes />} />
          </Route>
          <Route path="customers" element={<Customers />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="payments" element={<Payments />} />
          <Route path="ledger/:partyType/:partyId" element={<LedgerView />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="reports" element={<Reports />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Catch-all fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
