import puppeteer from 'puppeteer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy-initialize OCI S3 client.
// In ESM, imports are resolved BEFORE module body code runs,
// so process.env vars from dotenv are not available at module load time.
// This getter ensures the client is created only when first needed.
let _s3Client = undefined; // undefined = not yet initialized, null = no creds
const getS3Client = () => {
  if (_s3Client !== undefined) return _s3Client;
  
  if (process.env.OCI_ACCESS_KEY_ID && process.env.OCI_ENDPOINT) {
    _s3Client = new S3Client({
      region: process.env.OCI_REGION || 'auto',
      endpoint: process.env.OCI_ENDPOINT,
      credentials: {
        accessKeyId: process.env.OCI_ACCESS_KEY_ID,
        secretAccessKey: process.env.OCI_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
    console.log('[PDF] OCI S3 client initialized successfully');
  } else {
    console.warn('[PDF] OCI credentials not found, PDFs will be saved locally');
    _s3Client = null;
  }
  return _s3Client;
};

/**
 * Generate PDF, upload to OCI, and return the metadata.
 * Falls back to local storage only if OCI upload fails.
 */
export const generateInvoicePDF = async (saleData, companySettings) => {
  const fileName = `invoices/${saleData.transactionType}/${saleData.invoiceNumber}_${Date.now()}.pdf`;
  const s3Client = getS3Client();
  
  // Public URL for QR Code points to KHM backend public endpoint
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const publicUrl = `${baseUrl}/api/sales/${saleData._id}/pdf/public`;
  
  // Generate QR Code data URI
  const qrCodeDataUri = await QRCode.toDataURL(publicUrl, { width: 100, margin: 1 });

  // 1. Generate HTML Content
  const htmlContent = generateHTML(saleData, companySettings, qrCodeDataUri);

  // 2. Launch Puppeteer to create PDF
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  
  const pdfBuffer = await page.pdf({
    format: 'A4',
    margin: { top: '30px', right: '30px', bottom: '30px', left: '30px' },
    printBackground: true
  });
  
  await browser.close();

  // 3. Upload to OCI (primary) or fallback to local storage
  if (s3Client && process.env.OCI_BUCKET_NAME) {
    try {
      const command = new PutObjectCommand({
        Bucket: process.env.OCI_BUCKET_NAME,
        Key: fileName,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      });
      await s3Client.send(command);
      console.log(`[PDF] Uploaded to OCI: ${fileName}`);
      return { provider: 'oci', objectKey: fileName, fileName: path.basename(fileName) };
    } catch (error) {
      console.error('[PDF] OCI Upload Failed:', error.message);
      console.warn('[PDF] Falling back to local storage');
      return saveLocally(pdfBuffer, fileName);
    }
  } else {
    return saveLocally(pdfBuffer, fileName);
  }
};

const saveLocally = (buffer, fileName) => {
  const localDir = path.join(__dirname, '../../public/pdfs');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  const localPath = path.join(localDir, path.basename(fileName));
  fs.writeFileSync(localPath, buffer);
  return { provider: 'local', objectKey: path.basename(fileName), fileName: path.basename(fileName) };
};

const stateCodeToName = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory'
};

const generateHTML = (sale, company, qrCodeDataUri) => {
  const formatMoney = (paise) => (paise / 100).toFixed(2);
  const isEstimate = sale.transactionType === 'ESTIMATE';
  const title = isEstimate ? 'ESTIMATE / QUOTATION' : 'TAX INVOICE';
  const hasIgst = sale.totalIgst > 0;
  
  const getCompanyState = (code) => {
    const defaultCode = code || '24';
    return `${stateCodeToName[defaultCode] || ''} (${defaultCode})`;
  };

  const getCustomerState = (code) => {
    const defaultCode = code || '24';
    return `${stateCodeToName[defaultCode] || ''} (${defaultCode})`;
  };

  let rowsHtml = '';
  
  if (isEstimate) {
    rowsHtml = sale.items.map((item, index) => `
      <tr>
        <td class="text-center">${index + 1}</td>
        <td>
          <div class="product-name">${item.product.name}</div>
          ${item.product.sku ? `<div class="product-meta">SKU: ${item.product.sku}</div>` : ''}
        </td>
        <td class="text-center">${item.quantity}</td>
        <td class="text-right">₹${formatMoney(item.rate)}</td>
        <td class="text-right font-bold">₹${formatMoney(item.taxableValue || item.total)}</td>
      </tr>
    `).join('');
  } else {
    rowsHtml = sale.items.map((item, index) => `
      <tr>
        <td class="text-center">${index + 1}</td>
        <td>
          <div class="product-name">${item.product.name}</div>
          <div class="product-meta">HSN: ${item.product.hsnCode || 'N/A'}</div>
        </td>
        <td class="text-center">${item.quantity}</td>
        <td class="text-right">₹${formatMoney(item.rate)}</td>
        <td class="text-right">₹${formatMoney(item.taxableValue)}</td>
        ${hasIgst ? `
        <td class="text-right"><div class="tax-rate">${item.gstRate}%</div>₹${formatMoney(item.igst)}</td>
        ` : `
        <td class="text-right"><div class="tax-rate">${item.gstRate/2}%</div>₹${formatMoney(item.cgst)}</td>
        <td class="text-right"><div class="tax-rate">${item.gstRate/2}%</div>₹${formatMoney(item.sgst)}</td>
        `}
        <td class="text-right font-bold">₹${formatMoney(item.total)}</td>
      </tr>
    `).join('');
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', 'Inter', Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; font-size: 13px; margin: 0; padding: 0; background: #fff; }
        .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #e2e8f0; }
        
        .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 3px solid ${isEstimate ? '#ea580c' : '#2563eb'}; margin-bottom: 25px; }
        
        .company-name { font-size: 28px; font-weight: 800; color: #0f172a; margin: 0 0 5px 0; letter-spacing: -0.5px; }
        .company-details { font-size: 13px; color: #64748b; }
        .company-details strong { color: #334155; font-weight: 600; }
        
        .title-section { text-align: right; }
        .invoice-title { font-size: 26px; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 8px; color: ${isEstimate ? '#ea580c' : '#2563eb'}; }
        .qr-code { width: 90px; height: 90px; margin-top: 15px; border-radius: 4px; border: 1px solid #cbd5e1; padding: 2px; }
        
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; }
        .meta-table td { padding: 6px 0; }
        
        .bill-info-container { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 30px; }
        .bill-to-section { flex: 1; background: #f8fafc; padding: 18px; border-radius: 8px; border: 1px solid #e2e8f0; }
        .invoice-meta-section { flex: 1; padding: 18px; border-radius: 8px; border: 1px solid #e2e8f0; }
        
        .section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 700; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .customer-name { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 6px 0; }
        
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        .items-table th { background-color: ${isEstimate ? '#fff7ed' : '#eff6ff'}; padding: 12px 10px; text-align: left; border-bottom: 2px solid ${isEstimate ? '#fdba74' : '#93c5fd'}; border-top: 2px solid ${isEstimate ? '#fdba74' : '#93c5fd'}; font-size: 11px; text-transform: uppercase; color: ${isEstimate ? '#9a3412' : '#1e40af'}; font-weight: 700; letter-spacing: 0.5px; }
        .items-table td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
        .items-table tbody tr:nth-child(even) { background-color: #f8fafc; }
        
        .product-name { font-weight: 600; color: #1e293b; margin-bottom: 2px; }
        .product-meta { font-size: 11px; color: #64748b; }
        .tax-rate { font-size: 10px; color: #94a3b8; margin-bottom: 1px; }
        
        .text-center { text-align: center !important; }
        .text-right { text-align: right !important; }
        .font-bold { font-weight: 700 !important; }
        
        .summary-container { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 20px; }
        .notes-section { width: 55%; color: #475569; font-size: 12px; }
        .notes-box { padding: 15px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
        .totals-table { width: 40%; border-collapse: collapse; }
        .totals-table td { padding: 8px 10px; text-align: right; }
        .totals-table .label { text-align: left; color: #475569; font-weight: 600; }
        .grand-total-row td { border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; padding-top: 12px; padding-bottom: 12px; margin-top: 4px; font-size: 18px; font-weight: 800; color: #0f172a; background-color: #f8fafc; }
        
        .signatory-section { text-align: right; margin-top: 60px; }
        .signatory-company { font-size: 12px; color: #475569; font-weight: 600; margin-bottom: 50px; }
        .signatory-line { display: inline-block; border-top: 1px solid #cbd5e1; padding-top: 5px; width: 180px; text-align: center; font-size: 11px; color: #94a3b8; }
        
        .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; font-style: italic; }
      </style>
    </head>
    <body>
      <div class="invoice-box">
        <div class="header">
          <div>
            <h1 class="company-name">${company?.companyName || 'KHM Wholesale'}</h1>
            <div class="company-details">
              ${company?.address || 'Address'}<br>
              ${!isEstimate ? `<strong>GSTIN:</strong> ${company?.gstin || 'N/A'} &nbsp;|&nbsp; <strong>State:</strong> ${getCompanyState(company?.stateCode)}<br>` : ''}
              <strong>Phone:</strong> ${company?.phone || 'N/A'}
            </div>
          </div>
          <div class="title-section">
            <div class="invoice-title">${title}</div>
            ${qrCodeDataUri ? `<img src="${qrCodeDataUri}" class="qr-code" alt="QR Code" />` : ''}
          </div>
        </div>

        <div class="bill-info-container">
          <div class="bill-to-section">
            <div class="section-label">Billed To</div>
            <h3 class="customer-name">${sale.customer.name}</h3>
            <div style="color: #475569; font-size: 13px; line-height: 1.6;">
              ${sale.customer.address ? `${sale.customer.address}<br>` : ''}
              ${!isEstimate && sale.customer.gstin ? `<strong>GSTIN:</strong> ${sale.customer.gstin}<br>` : ''}
              ${!isEstimate ? `<strong>State:</strong> ${getCustomerState(sale.customer.stateCode)}<br>` : ''}
              <strong>Phone:</strong> ${sale.customer.phone || 'N/A'}
            </div>
          </div>
          
          <div class="invoice-meta-section">
             <div class="section-label">Invoice Details</div>
             <table style="width: 100%; font-size: 13px; line-height: 1.6; color: #475569;">
                <tr>
                  <td style="font-weight: 600; width: 45%;">Invoice No:</td>
                  <td style="font-weight: 700; color: #0f172a;">${sale.invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="font-weight: 600;">Date:</td>
                  <td>${new Date(sale.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                </tr>
                ${sale.dispatchThrough ? `
                <tr>
                  <td style="font-weight: 600;">Dispatch:</td>
                  <td>${sale.dispatchThrough}</td>
                </tr>
                ` : ''}
             </table>
          </div>
        </div>

        <table class="items-table">
          <thead>
            ${isEstimate ? `
            <tr>
              <th style="width: 5%" class="text-center">#</th>
              <th style="width: 45%">Item Description</th>
              <th style="width: 10%" class="text-center">Qty</th>
              <th style="width: 20%" class="text-right">Unit Rate</th>
              <th style="width: 20%" class="text-right">Total Amount</th>
            </tr>
            ` : `
            <tr>
              <th style="width: 5%" class="text-center">#</th>
              <th style="width: 30%">Item Description</th>
              <th style="width: 8%" class="text-center">Qty</th>
              <th style="width: 12%" class="text-right">Rate</th>
              <th style="width: 15%" class="text-right">Taxable</th>
              ${hasIgst ? `
              <th style="width: 15%" class="text-right">IGST</th>
              ` : `
              <th style="width: 10%" class="text-right">CGST</th>
              <th style="width: 10%" class="text-right">SGST</th>
              `}
              <th style="width: 15%" class="text-right">Amount</th>
            </tr>
            `}
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="summary-container">
          <div class="notes-section">
            ${sale.remarks ? `
            <div class="notes-box" style="margin-bottom: 15px;">
              <div class="section-label" style="border: none; padding: 0; margin-bottom: 5px;">Remarks</div>
              <div>${sale.remarks}</div>
            </div>
            ` : ''}
            
            <div class="notes-box">
              <div class="section-label" style="border: none; padding: 0; margin-bottom: 5px;">Terms & Conditions</div>
              <ol style="margin: 0; padding-left: 15px; color: #64748b;">
                <li>Goods once sold will not be taken back.</li>
                <li>Interest @ 18% p.a. will be charged if payment is delayed.</li>
                <li>Subject to local jurisdiction.</li>
              </ol>
            </div>
          </div>
          
          <table class="totals-table">
            <tr>
              <td class="label">Taxable Amount:</td>
              <td>₹${formatMoney(sale.subTotal)}</td>
            </tr>
            ${!isEstimate && hasIgst ? `
            <tr>
              <td class="label">Total IGST:</td>
              <td>₹${formatMoney(sale.totalIgst)}</td>
            </tr>
            ` : ''}
            ${!isEstimate && !hasIgst ? `
            <tr>
              <td class="label">Total CGST:</td>
              <td>₹${formatMoney(sale.totalCgst)}</td>
            </tr>
            <tr>
              <td class="label">Total SGST:</td>
              <td>₹${formatMoney(sale.totalSgst)}</td>
            </tr>
            ` : ''}
            ${sale.discount > 0 ? `
            <tr>
              <td class="label">Discount:</td>
              <td style="color: #ef4444;">- ₹${formatMoney(sale.discount)}</td>
            </tr>` : ''}
            <tr class="grand-total-row">
              <td class="label">Grand Total:</td>
              <td>₹${formatMoney(sale.grandTotal)}</td>
            </tr>
          </table>
        </div>
        
        <div class="signatory-section">
          <div class="signatory-company">For ${company?.companyName || 'KHM Wholesale'}</div>
          <div class="signatory-line">Authorized Signatory</div>
        </div>

        <div class="footer">
          ${isEstimate ? 'This is an estimated quotation. Not a tax invoice.' : 'Thank you for your business! This is a computer generated tax invoice.'}
        </div>
      </div>
    </body>
    </html>
  `;
};
