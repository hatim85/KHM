import React, { useState } from 'react';
import { 
  useGetProfitAndLossQuery,
  useGetGstSummaryQuery,
  useGetStockValuationQuery,
  useGetCustomerOutstandingQuery,
  useGetSupplierOutstandingQuery,
  useGetTopSellingProductsQuery,
  useGetSalesReportQuery,
  useGetEstimateSalesReportQuery,
  useGetTopEstimateProductsQuery,
  useGetEstimateConversionsQuery,
  useGetCustomerSalesQuery,
  useGetCustomerEstimatesQuery,
  useGetPurchaseReportQuery,
  useGetExpenseReportQuery
} from '../features/reportApi';
import { formatMoney } from '../utils/formatters';

const Reports = () => {
  const [activeTab, setActiveTab] = useState('overview');
  
  // Date range filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const queryParams = { startDate, endDate };

  // Skip queries unless their tab is active
  const { data: pnlRes, isLoading: pnlLoading } = useGetProfitAndLossQuery(queryParams, { skip: activeTab !== 'pnl' && activeTab !== 'overview' });
  const { data: gstRes, isLoading: gstLoading } = useGetGstSummaryQuery(queryParams, { skip: activeTab !== 'gst' });
  const { data: stockRes, isLoading: stockLoading } = useGetStockValuationQuery(undefined, { skip: activeTab !== 'inventory' });
  const { data: custRes, isLoading: custLoading } = useGetCustomerOutstandingQuery(undefined, { skip: activeTab !== 'receivables' });
  const { data: supRes, isLoading: supLoading } = useGetSupplierOutstandingQuery(undefined, { skip: activeTab !== 'payables' });
  
  // Sales
  const { data: salesRes, isLoading: salesLoading } = useGetSalesReportQuery(queryParams, { skip: activeTab !== 'sales' });
  const { data: estimatesRes, isLoading: estimatesLoading } = useGetEstimateSalesReportQuery(queryParams, { skip: activeTab !== 'estimates' && activeTab !== 'overview' });
  const { data: conversionsRes, isLoading: conversionsLoading } = useGetEstimateConversionsQuery(queryParams, { skip: activeTab !== 'estimates' });

  // Products
  const { data: topSalesRes, isLoading: topSalesLoading } = useGetTopSellingProductsQuery(queryParams, { skip: activeTab !== 'products' });
  const { data: topEstRes, isLoading: topEstLoading } = useGetTopEstimateProductsQuery(queryParams, { skip: activeTab !== 'products' });
  
  // Customers
  const { data: custSalesRes, isLoading: custSalesLoading } = useGetCustomerSalesQuery(queryParams, { skip: activeTab !== 'customers' });
  const { data: custEstRes, isLoading: custEstLoading } = useGetCustomerEstimatesQuery(queryParams, { skip: activeTab !== 'customers' });

  // Purchases & Expenses
  const { data: purchRes, isLoading: purchLoading } = useGetPurchaseReportQuery(queryParams, { skip: activeTab !== 'purchases' });
  const { data: expRes, isLoading: expLoading } = useGetExpenseReportQuery(queryParams, { skip: activeTab !== 'expenses' && activeTab !== 'overview' });


  const renderTable = (loading, data, columns, title, emptyMsg = 'No data found.') => {
    if (loading) return <div className="p-8 text-slate-500 dark:text-slate-400">Loading {title}...</div>;
    if (!data || data.length === 0) return <div className="p-8 text-slate-500">{emptyMsg}</div>;
    return (
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-100 dark:bg-slate-800/40">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                {columns.map((col, i) => (
                  <th key={i} className={`py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ${col.align === 'right' ? 'text-right' : ''}`}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {data.map((row, i) => (
                <tr key={row._id || i} className="hover:bg-slate-100 dark:hover:bg-slate-800/20 transition">
                  {columns.map((col, j) => (
                    <td key={j} className={`py-4 px-6 text-sm ${col.align === 'right' ? 'text-right' : ''}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderOverview = () => {
    const netSales = pnlRes?.data?.netSales || 0;
    const estSales = estimatesRes?.data?.reduce((acc, curr) => acc + curr.grandTotal, 0) || 0; // simplistic client-side aggregate for overview if needed, or better wait for summary endpoint. Since we only fetched records, let's use what we have or show loading.
    
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Net Sales (TAX)</h3>
          <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 font-mono">{formatMoney(netSales)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Estimate Sales</h3>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">{(estimatesLoading || pnlLoading) ? '...' : formatMoney(estSales)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Operating Expenses</h3>
          <p className="text-3xl font-bold text-rose-600 dark:text-rose-400 font-mono">{formatMoney(pnlRes?.data?.totalExpenses || 0)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Net Profit (TAX)</h3>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">{formatMoney(pnlRes?.data?.netProfit || 0)}</p>
        </div>
      </div>
    );
  };

  const renderSales = () => {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Tax Invoices (Billed Sales)</h2>
        {renderTable(salesLoading, salesRes?.data, [
          { header: 'Invoice', render: r => <div className="font-mono text-indigo-600 dark:text-indigo-400">{r.invoiceNumber}</div> },
          { header: 'Date', render: r => new Date(r.invoiceDate).toLocaleDateString() },
          { header: 'Customer', render: r => r.customer?.name },
          { header: 'GSTIN', render: r => <span className="font-mono text-xs">{r.customer?.gstin || 'Unregistered'}</span> },
          { header: 'Taxable', align: 'right', render: r => formatMoney(r.subTotal) },
          { header: 'GST', align: 'right', render: r => formatMoney(r.totalCgst + r.totalSgst + r.totalIgst) },
          { header: 'Total', align: 'right', render: r => <span className="font-bold font-mono text-slate-900 dark:text-white">{formatMoney(r.grandTotal)}</span> },
          { header: 'Paid', align: 'right', render: r => formatMoney(r.amountPaid || 0) },
          { header: 'Outstanding', align: 'right', render: r => <span className="text-amber-600 dark:text-amber-400">{formatMoney(r.grandTotal - (r.amountPaid || 0) - (r.returnedAmount || 0) - (r.creditNoteAmount || 0) - (r.debitNoteAmount || 0))}</span> },
          { header: 'Pay Status', render: r => (
            <span className={`px-2 py-1 text-xs rounded font-bold ${
              r.paymentStatus === 'PAID' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 
              r.paymentStatus === 'PARTIAL' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}>
              {r.paymentStatus}
            </span>
          )},
        ], 'Tax Sales')}
      </div>
    );
  };

  const renderEstimates = () => {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mb-2">Estimates</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">These transactions reduce inventory but do not incur GST.</p>
          {renderTable(estimatesLoading, estimatesRes?.data, [
            { header: 'Estimate No', render: r => <div className="font-mono text-emerald-600 dark:text-emerald-400">{r.invoiceNumber}</div> },
            { header: 'Date', render: r => new Date(r.invoiceDate).toLocaleDateString() },
          { header: 'Customer', render: r => r.customerSnapshot?.name || r.customer?.name },
            { header: 'Total Sale Value', align: 'right', render: r => <span className="font-bold font-mono text-slate-900 dark:text-white">{formatMoney(r.grandTotal)}</span> },
            { header: 'Paid', align: 'right', render: r => formatMoney(r.amountPaid || 0) },
            { header: 'Outstanding', align: 'right', render: r => <span className="text-amber-600 dark:text-amber-400">{formatMoney(r.grandTotal - (r.amountPaid || 0) - (r.returnedAmount || 0) - (r.creditNoteAmount || 0))}</span> },
            { header: 'Pay Status', render: r => (
              <span className={`px-2 py-1 text-xs rounded font-bold ${
                r.paymentStatus === 'PAID' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 
                r.paymentStatus === 'PARTIAL' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              }`}>
                {r.paymentStatus}
              </span>
            )},
          ], 'Estimates')}
        </div>
        
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Estimate Conversions</h2>
          {renderTable(conversionsLoading, conversionsRes?.data, [
            { header: 'Estimate No', render: r => <div className="font-mono">{r.estimateNumber}</div> },
            { header: 'Estimate Total', align: 'right', render: r => formatMoney(r.estimateTotal) },
            { header: 'Conversion Status', render: r => (
              <span className={`px-2 py-1 text-xs rounded ${r.conversionStatus === 'CONVERTED' ? 'bg-indigo-900/50 text-indigo-600 dark:text-indigo-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                {r.conversionStatus}
              </span>
            )},
            { header: 'Converted Invoice', render: r => r.invoiceNumber ? <span className="font-mono text-indigo-600 dark:text-indigo-400">{r.invoiceNumber}</span> : '—' },
            { header: 'Invoice Total', align: 'right', render: r => r.invoiceTotal ? formatMoney(r.invoiceTotal) : '—' },
          ], 'Conversions')}
        </div>
      </div>
    );
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'sales', label: 'Sales (Tax)' },
    { id: 'estimates', label: 'Estimates' },
    { id: 'purchases', label: 'Purchases' },
    { id: 'pnl', label: 'P&L (Tax)' },
    { id: 'gst', label: 'GST Summary' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'receivables', label: 'Receivables' },
    { id: 'payables', label: 'Payables' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'products', label: 'Product Analysis' },
    { id: 'customers', label: 'Customer Analysis' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Reports & Analytics</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Real-time insights with strict TAX/ESTIMATE separation.</p>
        </div>
        
        {!['inventory', 'receivables', 'payables'].includes(activeTab) && (
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase px-2">From</span>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase px-2">To</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500" />
            </div>
          </div>
        )}
      </div>

      <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide border-b border-slate-200 dark:border-slate-800">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap ${
              activeTab === tab.id 
                ? 'bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/40'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'sales' && renderSales()}
        {activeTab === 'estimates' && renderEstimates()}
        {activeTab === 'purchases' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Purchase Report</h2>
            {renderTable(purchLoading, purchRes?.data, [
              { header: 'Invoice', render: r => <div className="font-mono text-indigo-600 dark:text-indigo-400">{r.invoiceNumber}</div> },
              { header: 'Date', render: r => new Date(r.invoiceDate).toLocaleDateString() },
              { header: 'Supplier', render: r => r.supplier?.name },
              { header: 'Stream', render: r => (
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${r.transactionType === 'TAX' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                  {r.transactionType}
                </span>
              )},
              { header: 'Subtotal', align: 'right', render: r => formatMoney(r.subTotal) },
              { header: 'Tax', align: 'right', render: r => formatMoney(r.taxTotal || 0) },
              { header: 'Total', align: 'right', render: r => <span className="font-bold font-mono text-slate-900 dark:text-white">{formatMoney(r.grandTotal)}</span> },
              { header: 'Paid', align: 'right', render: r => formatMoney(r.amountPaid || 0) },
              { header: 'Outstanding', align: 'right', render: r => <span className="text-amber-600 dark:text-amber-400">{formatMoney(r.grandTotal - (r.amountPaid || 0) - (r.returnedAmount || 0) - (r.debitNoteAmount || 0))}</span> },
              { header: 'Pay Status', render: r => (
                <span className={`px-2 py-1 text-xs rounded font-bold ${
                  r.paymentStatus === 'PAID' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 
                  r.paymentStatus === 'PARTIAL' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }`}>
                  {r.paymentStatus || 'UNPAID'}
                </span>
              )},
            ], 'Purchases')}
          </div>
        )}

        {activeTab === 'pnl' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Profit & Loss Statement (Tax Stream)</h2>
            {pnlLoading ? <div className="p-8 text-slate-500 dark:text-slate-400">Loading P&L...</div> : pnlRes?.data ? (
              <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                    <tr className="hover:bg-slate-100 dark:hover:bg-slate-800/20">
                      <td className="py-4 px-6 text-sm font-semibold text-slate-600 dark:text-slate-300">Gross Sales (Tax Invoices)</td>
                      <td className="py-4 px-6 text-right font-mono text-lg text-indigo-600 dark:text-indigo-400">{formatMoney(pnlRes.data.grossSales ?? pnlRes.data.netSales)}</td>
                    </tr>
                    {(pnlRes.data.salesReturns || 0) > 0 && (
                      <tr className="hover:bg-slate-100 dark:hover:bg-slate-800/20">
                        <td className="py-4 px-6 text-sm font-semibold text-slate-600 dark:text-slate-300">Less: Sales Returns</td>
                        <td className="py-4 px-6 text-right font-mono text-lg text-rose-500">({formatMoney(pnlRes.data.salesReturns)})</td>
                      </tr>
                    )}
                    <tr className="hover:bg-slate-100 dark:hover:bg-slate-800/20">
                      <td className="py-4 px-6 text-sm font-semibold text-slate-600 dark:text-slate-300">Net Sales (Tax Invoices)</td>
                      <td className="py-4 px-6 text-right font-mono text-lg text-indigo-600 dark:text-indigo-400">{formatMoney(pnlRes.data.netSales)}</td>
                    </tr>
                    <tr className="hover:bg-slate-100 dark:hover:bg-slate-800/20">
                      <td className="py-4 px-6 text-sm font-semibold text-slate-600 dark:text-slate-300">Cost of Goods Sold (COGS)</td>
                      <td className="py-4 px-6 text-right font-mono text-lg text-rose-600 dark:text-rose-400">({formatMoney(pnlRes.data.cogs)})</td>
                    </tr>
                    <tr className="bg-slate-800/30">
                      <td className="py-4 px-6 text-sm font-bold text-slate-900 dark:text-white">Gross Profit</td>
                      <td className={`py-4 px-6 text-right font-mono text-lg font-bold ${pnlRes.data.grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatMoney(pnlRes.data.grossProfit)}</td>
                    </tr>
                    <tr className="hover:bg-slate-100 dark:hover:bg-slate-800/20">
                      <td className="py-4 px-6 text-sm font-semibold text-slate-600 dark:text-slate-300">Operating Expenses</td>
                      <td className="py-4 px-6 text-right font-mono text-lg text-rose-600 dark:text-rose-400">({formatMoney(pnlRes.data.totalExpenses)})</td>
                    </tr>
                    <tr className="bg-indigo-500/5 border-t-2 border-indigo-500/30">
                      <td className="py-5 px-6 text-base font-bold text-slate-900 dark:text-white">Net Profit</td>
                      <td className={`py-5 px-6 text-right font-mono text-xl font-bold ${pnlRes.data.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatMoney(pnlRes.data.netProfit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : <div className="p-8 text-slate-500">No data available.</div>}
          </div>
        )}

        {activeTab === 'gst' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">GST Summary (Tax Invoices Only)</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Estimates are completely excluded. Bills of Supply (0% GST exempt) are shown separately and never add to output tax.</p>
            {gstLoading ? <div className="p-8 text-slate-500 dark:text-slate-400">Loading GST...</div> : gstRes?.data ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
                  <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Output GST (Sales)</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Taxable Value</span><span className="font-mono text-slate-900 dark:text-white">{formatMoney(gstRes.data.outputGst?.taxableValue)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">CGST</span><span className="font-mono text-slate-900 dark:text-white">{formatMoney(gstRes.data.outputGst?.cgst)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">SGST</span><span className="font-mono text-slate-900 dark:text-white">{formatMoney(gstRes.data.outputGst?.sgst)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">IGST</span><span className="font-mono text-slate-900 dark:text-white">{formatMoney(gstRes.data.outputGst?.igst)}</span></div>
                    <div className="flex justify-between pt-2 border-t border-slate-300 dark:border-slate-700"><span className="text-slate-900 dark:text-white font-bold">Total Output</span><span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{formatMoney(gstRes.data.outputGst?.total)}</span></div>
                    <div className="flex justify-between pt-2 mt-2 border-t border-dashed border-slate-300 dark:border-slate-700"><span className="text-emerald-600 dark:text-emerald-400">Exempt (Bills of Supply{typeof gstRes.data.exemptSupplies?.count === 'number' ? ` · ${gstRes.data.exemptSupplies.count}` : ''})</span><span className="font-mono text-emerald-600 dark:text-emerald-400">{formatMoney(gstRes.data.exemptSupplies?.exemptValue)}</span></div>
                    {(gstRes.data.creditNotes?.total > 0 || gstRes.data.creditNotes?.taxableValue > 0) && (
                      <div className="flex justify-between"><span className="text-rose-600 dark:text-rose-400">Less: Credit Notes</span><span className="font-mono text-rose-600 dark:text-rose-400">- {formatMoney(gstRes.data.creditNotes?.total)}</span></div>
                    )}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
                  <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Input Tax Credit (Purchases)</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Taxable Value</span><span className="font-mono text-slate-900 dark:text-white">{formatMoney(gstRes.data.inputTaxCredit?.taxableValue)}</span></div>
                    {(gstRes.data.debitNotes?.total > 0 || gstRes.data.debitNotes?.taxableValue > 0) && (
                      <div className="flex justify-between"><span className="text-amber-600 dark:text-amber-400">Add: Debit Notes</span><span className="font-mono text-amber-600 dark:text-amber-400">+ {formatMoney(gstRes.data.debitNotes?.total)}</span></div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-slate-300 dark:border-slate-700"><span className="text-slate-900 dark:text-white font-bold">Total ITC</span><span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(gstRes.data.inputTaxCredit?.total)}</span></div>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
                  <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Net GST Liability</h3>
                  <p className={`text-4xl font-bold font-mono ${gstRes.data.netLiability >= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {formatMoney(gstRes.data.netLiability)}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">{gstRes.data.netLiability >= 0 ? 'Payable to Government' : 'Credit Available'}</p>
                </div>
              </div>
            ) : <div className="p-8 text-slate-500">No data available.</div>}
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Stock Valuation (Combined Physical Stock)</h2>
              {stockRes?.data && <div className="text-sm text-slate-500 dark:text-slate-400">Total Value: <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{formatMoney(stockRes.data.totalValue)}</span></div>}
            </div>
            {renderTable(stockLoading, stockRes?.data?.items, [
              { header: 'Product', render: r => r.name },
              { header: 'SKU', render: r => <span className="font-mono text-xs text-slate-400">{r.sku || '—'}</span> },
              { header: 'TAX Qty', align: 'right', render: r => <span className="font-mono text-indigo-600 dark:text-indigo-300">{r.taxStock ?? '—'}</span> },
              { header: 'EST Qty', align: 'right', render: r => <span className="font-mono text-amber-600 dark:text-amber-300">{r.estimateStock ?? '—'}</span> },
              { header: 'Total Qty', align: 'right', render: r => <span className="font-bold">{r.quantity}</span> },
              { header: 'Unit', render: r => r.unit },
              { header: 'Avg Cost (WAC)', align: 'right', render: r => formatMoney(r.averageCost) },
              { header: 'Stock Value', align: 'right', render: r => <span className="font-mono font-bold text-slate-900 dark:text-white">{formatMoney(r.value)}</span> },
            ], 'Stock Valuation')}
          </div>
        )}

        {activeTab === 'receivables' && renderTable(custLoading, custRes?.data, [
          { header: 'Customer', render: r => r.name },
          { header: 'Phone', render: r => r.phone || '—' },
          { header: 'Outstanding Balance', align: 'right', render: r => <div className="font-mono font-bold text-amber-600 dark:text-amber-400">{formatMoney(r.totalOutstanding)}</div> }
        ], 'Receivables')}

        {activeTab === 'payables' && renderTable(supLoading, supRes?.data, [
          { header: 'Supplier', render: r => r.name },
          { header: 'Phone', render: r => r.phone || '—' },
          { header: 'Outstanding Balance', align: 'right', render: r => <div className="font-mono font-bold text-rose-600 dark:text-rose-400">{formatMoney(r.totalOutstanding)}</div> }
        ], 'Payables')}

        {activeTab === 'expenses' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Expense Report (Global Ledger)</h2>
            {renderTable(expLoading, expRes?.data, [
              { header: 'Date', render: r => new Date(r.date).toLocaleDateString() },
              { header: 'Category', render: r => r.category?.name || '—' },
              { header: 'Notes', render: r => <span className="text-slate-500 dark:text-slate-400 max-w-[200px] truncate block">{r.notes || '—'}</span> },
              { header: 'Mode', render: r => <span className="text-xs">{r.paymentMode?.replace('_', ' ')}</span> },
              { header: 'Reference', render: r => <span className="font-mono text-xs">{r.referenceNumber || '—'}</span> },
              { header: 'Amount', align: 'right', render: r => <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{formatMoney(r.amount)}</span> },
            ], 'Expenses')}
          </div>
        )}

        {activeTab === 'products' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mb-4">Top TAX Products</h2>
              {renderTable(topSalesLoading, topSalesRes?.data, [
                { header: 'Product', render: r => r.name },
                { header: 'SKU', render: r => <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{r.sku || '—'}</span> },
                { header: 'Qty Sold', align: 'right', render: r => r.totalQuantity },
                { header: 'Sec Qty', align: 'right', render: r => (r.totalSecondaryQuantity > 0 ? `${r.totalSecondaryQuantity} ${r.secondaryUnit || ''}` : '—') },
                { header: 'Revenue (Taxable)', align: 'right', render: r => formatMoney(r.totalRevenue) },
                { header: 'Avg Price', align: 'right', render: r => formatMoney(Math.round(r.averageSellingPrice || 0)) }
              ], 'Top Tax Products')}
            </div>
            <div>
              <h2 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mb-4">Top ESTIMATE Products</h2>
              {renderTable(topEstLoading, topEstRes?.data, [
                { header: 'Product', render: r => r.name },
                { header: 'SKU', render: r => <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{r.sku || '—'}</span> },
                { header: 'Qty Sold', align: 'right', render: r => r.totalQuantity },
                { header: 'Sec Qty', align: 'right', render: r => (r.totalSecondaryQuantity > 0 ? `${r.totalSecondaryQuantity} ${r.secondaryUnit || ''}` : '—') },
                { header: 'Revenue (Total)', align: 'right', render: r => formatMoney(r.totalRevenue) },
                { header: 'Avg Price', align: 'right', render: r => formatMoney(Math.round(r.averageSellingPrice || 0)) }
              ], 'Top Estimate Products')}
            </div>
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mb-4">Customer Sales (Tax Invoices)</h2>
              {renderTable(custSalesLoading, custSalesRes?.data, [
                { header: 'Customer', render: r => r.name },
                { header: 'Invoices', align: 'right', render: r => r.numberOfInvoices },
                { header: 'Total Qty', align: 'right', render: r => r.totalQuantity },
                { header: 'Taxable Value', align: 'right', render: r => formatMoney(r.taxableValue) },
                { header: 'Total GST', align: 'right', render: r => formatMoney(r.totalGst) },
                { header: 'Total Sales', align: 'right', render: r => <span className="font-mono font-bold text-slate-900 dark:text-white">{formatMoney(r.totalSales)}</span> },
              ], 'Customer Tax Sales')}
            </div>
            <div>
              <h2 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mb-4">Customer Estimates</h2>
              {renderTable(custEstLoading, custEstRes?.data, [
                { header: 'Customer', render: r => r.name },
                { header: 'Estimates', align: 'right', render: r => r.numberOfEstimates },
                { header: 'Total Qty', align: 'right', render: r => r.totalQuantity },
                { header: 'Total Estimate Value', align: 'right', render: r => <span className="font-mono font-bold text-slate-900 dark:text-white">{formatMoney(r.totalEstimateValue)}</span> },
              ], 'Customer Estimates')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
