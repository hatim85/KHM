import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const reportApi = createApi({
  reducerPath: 'reportApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/reports',
  }),
  tagTypes: ['Report'],
  endpoints: (builder) => ({
    getProfitAndLoss: builder.query({ query: (params) => ({ url: '/pnl', params }) }),
    getGstSummary: builder.query({ query: (params) => ({ url: '/gst', params }) }),
    getStockValuation: builder.query({ query: () => '/stock' }),
    
    // TAX
    getSalesReport: builder.query({ query: (params) => ({ url: '/sales', params }) }),
    getCustomerOutstanding: builder.query({ query: (params) => ({ url: '/customers/outstanding', params }) }),
    getSupplierOutstanding: builder.query({ query: (params) => ({ url: '/suppliers/outstanding', params }) }),
    getTopSellingProducts: builder.query({ query: (params) => ({ url: '/products/top-selling', params }) }),
    getCustomerSales: builder.query({ query: (params) => ({ url: '/customers/sales', params }) }),
    
    // ESTIMATE
    getEstimateSalesReport: builder.query({ query: (params) => ({ url: '/estimates', params }) }),
    getTopEstimateProducts: builder.query({ query: (params) => ({ url: '/products/top-estimates', params }) }),
    getEstimateConversions: builder.query({ query: (params) => ({ url: '/estimates/conversions', params }) }),
    getCustomerEstimates: builder.query({ query: (params) => ({ url: '/customers/estimates', params }) }),
    
    // GLOBAL
    getPurchaseReport: builder.query({ query: (params) => ({ url: '/purchases', params }) }),
    getExpenseReport: builder.query({ query: (params) => ({ url: '/expenses', params }) }),
  }),
});

export const {
  useGetProfitAndLossQuery,
  useGetGstSummaryQuery,
  useGetStockValuationQuery,
  useGetSalesReportQuery,
  useGetCustomerOutstandingQuery,
  useGetSupplierOutstandingQuery,
  useGetTopSellingProductsQuery,
  useGetCustomerSalesQuery,
  useGetEstimateSalesReportQuery,
  useGetTopEstimateProductsQuery,
  useGetEstimateConversionsQuery,
  useGetCustomerEstimatesQuery,
  useGetPurchaseReportQuery,
  useGetExpenseReportQuery
} = reportApi;
