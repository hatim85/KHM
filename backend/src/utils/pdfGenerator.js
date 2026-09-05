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
    margin: { top: '15px', right: '20px', bottom: '15px', left: '20px' },
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

const generateHTML = (sale, companySettings, qrCodeDataUri) => {
  const formatMoney = (paise) => (paise / 100).toFixed(2);
  const isEstimate = sale.transactionType === 'ESTIMATE';
  const title = isEstimate ? 'ESTIMATE' : 'TAX INVOICE';
  const hasIgst = sale.totalIgst > 0;

  // Historical snapshots win — live masters may have changed since finalization.
  const company = (sale.companySnapshot && sale.companySnapshot.companyName)
    ? { ...companySettings, ...sale.companySnapshot }
    : (companySettings || sale.companySnapshot || {});
  const custLive = sale.customer || {};
  const custSnap = sale.customerSnapshot || {};
  const customer = {
    name: custSnap.name || custLive.name || '',
    address: custSnap.address || custLive.address || '',
    gstin: custSnap.gstin || custLive.gstin || '',
    stateCode: custSnap.stateCode || custLive.stateCode || '',
    phone: custSnap.phone || custLive.phone || '',
  };
  const prodOf = (item) => {
    const live = (item.product && typeof item.product === 'object') ? item.product : {};
    const liveUnit = live.unit && typeof live.unit === 'object' ? (live.unit.shortName || '') : '';
    return {
      name: item.productName || live.name || '',
      sku: item.sku || live.sku || '',
      hsnCode: item.hsnCode || live.hsnCode || '',
      unit: item.unitName || liveUnit,
    };
  };

  // Qty printed with the product's Unit of Measure: "2 NOS", "5 PCS", ...
  const qtyWithUnit = (item) => {
    const u = prodOf(item).unit;
    return u ? `${item.quantity} ${u}` : `${item.quantity}`;
  };

  // Place of Supply = customer's state (name + 2-digit code).
  const placeOfSupply = () => {
    const code = customer.stateCode || '24';
    return `${stateCodeToName[code] || ''} (${code})`;
  };

  // Amount in words, Indian numbering (Crore / Lakh / Thousand).
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const twoDigits = (n) => {
    if (n < 20) return ONES[n];
    return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
  };
  const threeDigits = (n) => {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return `${h ? `${ONES[h]} Hundred${rest ? ' ' : ''}` : ''}${rest ? twoDigits(rest) : ''}`;
  };
  const rupeesInWords = (n) => {
    if (n === 0) return 'Zero';
    const parts = [];
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const rest = n % 1000;
    if (crore) parts.push(`${threeDigits(crore)} Crore`);
    if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
    if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
    if (rest) parts.push(threeDigits(rest));
    return parts.join(' ');
  };
  const amountInWords = (paise) => {
    const rupees = Math.floor(paise / 100);
    const paisePart = Math.round(paise % 100);
    const base = `Rupees ${rupeesInWords(rupees)}`;
    return paisePart > 0 ? `${base} and Paise ${twoDigits(paisePart)} Only` : `${base} Only`;
  };

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
    rowsHtml = sale.items.map((item, index) => {
      const prod = prodOf(item);
      return `
      <tr>
        <td class="text-center">${index + 1}</td>
        <td>
          <div class="product-name">${prod.name}</div>
          ${prod.sku ? `<div class="product-meta">SKU: ${prod.sku}</div>` : ''}
        </td>
        <td>
          <div class="product-meta">
           ${item.specification || '-'}
          </div>
        </td>
        <td class="text-center">${qtyWithUnit(item)}</td>
        <td class="text-right">₹${formatMoney(item.rate)}</td>
        <td class="text-right font-bold">₹${formatMoney(item.taxableValue || item.total)}</td>
      </tr>
    `;
    }).join('');
  } else {
    rowsHtml = sale.items.map((item, index) => {
      const prod = prodOf(item);
      return `
      <tr>
        <td class="text-center">${index + 1}</td>
        <td>
          <div class="product-name">${prod.name}</div>
          <div class="product-meta">HSN: ${prod.hsnCode || 'N/A'}</div>
        </td>
        <td>
          <div class="product-meta">
            ${item.specification || '-'}
          </div>
        </td>
        <td class="text-center">${qtyWithUnit(item)}</td>
        <td class="text-right">₹${formatMoney(item.rate)}</td>
        <td class="text-right">₹${formatMoney(item.taxableValue)}</td>
        ${hasIgst ? `
        <td class="text-right"><div class="tax-rate">${item.gstRate}%</div>₹${formatMoney(item.igst)}</td>
        ` : `
        <td class="text-right"><div class="tax-rate">${item.gstRate / 2}%</div>₹${formatMoney(item.cgst)}</td>
        <td class="text-right"><div class="tax-rate">${item.gstRate / 2}%</div>₹${formatMoney(item.sgst)}</td>
        `}
        <td class="text-right font-bold">₹${formatMoney(item.total)}</td>
      </tr>
    `;
    }).join('');
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', 'Inter', Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; font-size: 13px; margin: 0; padding: 0; background: #fff; }
        .invoice-box { max-width: 800px; margin: auto; padding: 20px 24px; }
        
        .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 3px solid ${isEstimate ? '#ea580c' : '#2563eb'}; margin-bottom: 20px; }
        
        .company-name { font-size: 28px; font-weight: 800; color: #0f172a; margin: 0 0 5px 0; letter-spacing: -0.5px; }
        .company-details { font-size: 13px; color: #64748b; }
        .company-details strong { color: #334155; font-weight: 600; }
        
        .title-section { text-align: right; display: flex; flex-direction: column; align-items: flex-end; }
        .invoice-title { font-size: 26px; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 8px; color: ${isEstimate ? '#ea580c' : '#2563eb'}; }
        .qr-code { width: 78px; height: 78px; margin-top: 6px; border-radius: 3px; border: 1px solid #cbd5e1; padding: 1px; }
        
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; }
        .meta-table td { padding: 6px 0; }
        
        .bill-info-container {
          display: flex;
          width: 100%;
          gap: 20px;
          margin-bottom: 24px;
          align-items: stretch;
        }

        .bill-to-section {
          width: calc(50% - 10px);
          flex: 0 0 calc(50% - 10px);
          background: #f8fafc;
          padding: 16px 18px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .meta-column {
          width: calc(50% - 10px);
          flex: 0 0 calc(50% - 10px);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .invoice-meta-section {
          width: 100%;
          padding: 16px 18px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        
        .section-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #64748b;
          font-weight: 700;
          margin-bottom: 8px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 6px;
        }
        .customer-name { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 6px 0; }
        
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; margin-top: 4px; }
        .items-table th {
          background-color: ${isEstimate ? '#fff7ed' : '#eff6ff'};
          padding: 10px 8px;
          text-align: left;
          border-bottom: 2px solid ${isEstimate ? '#fdba74' : '#93c5fd'};
          border-top: 2px solid ${isEstimate ? '#fdba74' : '#93c5fd'};
          font-size: 10px;
          text-transform: uppercase;
          color: ${isEstimate ? '#9a3412' : '#1e40af'};
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        .items-table td {
          padding: 10px 8px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: top;
        }
        .items-table tbody tr:nth-child(even) { background-color: #f8fafc; }
        
        .product-name { font-weight: 600; color: #1e293b; margin-bottom: 2px; }
        .product-meta { font-size: 11px; color: #1e293b; }
        .tax-rate { font-size: 10px; color: #94a3b8; margin-bottom: 1px; }
        
        .text-center { text-align: center !important; }
        .text-right { text-align: right !important; }
        .font-bold { font-weight: 700 !important; }
        
        .summary-container {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-top: 10px;
          gap: 30px;
        }

        .notes-section {
          width: 55%;
          color: #475569;
          font-size: 12px;
        }
        .notes-box { padding: 14px 18px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
        .transport-box {
          width: 100%;
          padding: 12px 18px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 13px;
          color: #475569;
        }
        .amount-words {
          margin-top: 12px;
          margin-left: auto;
          width: fit-content;
          max-width: 100%;
          padding: 10px 14px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 13px;
          color: #334155;
          text-align: left;
        }

        .amount-words .section-label {
          margin-bottom: 6px;
        }

        .amount-words-value {
          font-weight: 700;
          color: #0f172a;
        }
         .totals-table {
          width: 40%;
          border-collapse: collapse;
        }

        .totals-table td {
          padding: 6px 10px;
          text-align: right;
        }
        .totals-table .label { text-align: left; color: #475569; font-weight: 600; }
        .grand-total-row td { border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; padding-top: 12px; padding-bottom: 12px; margin-top: 4px; font-size: 18px; font-weight: 800; color: #0f172a; background-color: #f8fafc; }
        
        .signatory-section { text-align: right; margin-top: 35px; }
        .signatory-company { font-size: 12px; color: #475569; font-weight: 600; margin-bottom: 35px; }
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
            <h3 class="customer-name">${customer.name}</h3>
            <div style="color: #475569; font-size: 13px; line-height: 1.6;">
              ${customer.address ? `${customer.address}<br>` : ''}
              ${!isEstimate && customer.gstin ? `<strong>GSTIN:</strong> ${customer.gstin}<br>` : ''}
              <strong>Place of Supply:</strong> ${placeOfSupply()}<br>
              <strong>Phone:</strong> ${customer.phone || 'N/A'}
            </div>
          </div>
          
          <div class="meta-column">
          <div class="invoice-meta-section">
             <div class="section-label">${isEstimate ? 'Estimate Details' : 'Invoice Details'}</div>
             <table style="width: 100%; font-size: 13px; line-height: 1.6; color: #475569;">
                <tr>
                  <td style="font-weight: 600; width: 45%;">${isEstimate ? 'Estimate No:' : 'Invoice No:'}</td>
                  <td style="font-weight: 700; color: #0f172a;">${sale.invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="font-weight: 600;">Date:</td>
                  <td>${new Date(sale.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                </tr>
              </table>
          </div>
          ${sale.dispatchThrough ? `
          <div class="transport-box">
            <div class="section-label">Dispatch Details</div>
            <div>${sale.dispatchThrough}</div>
          </div>
          ` : ''}
          </div>
        </div>

        <table class="items-table">
          <thead>
            ${isEstimate ? `
            <tr>
              <th style="width: 5%" class="text-center">#</th>
              <th style="width: 30%">Item</th>
              <th style="width: 18%">Specification</th>
              <th style="width: 10%" class="text-center">Qty</th>
              <th style="width: 18%" class="text-right">Unit Rate</th>
              <th style="width: 19%" class="text-right">Total Amount</th>
            </tr>
            ` : `
            <tr>
              <th style="width: 4%" class="text-center">#</th>
              <th style="width: 21%">Item</th>
              <th style="width: 15%">Specification</th>
              <th style="width: 8%" class="text-center">Qty</th>
              <th style="width: 10%" class="text-right">Rate</th>
              <th style="width: 12%" class="text-right">Taxable</th>
              ${hasIgst ? `
              <th style="width: 15%" class="text-right">IGST</th>
              ` : `
              <th style="width: 7%" class="text-right">CGST</th>
              <th style="width: 8%" class="text-right">SGST</th>
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
            <div class="notes-box">
              <div class="section-label">Remarks</div>
              <div>${sale.remarks}</div>
            </div>
            ` : ''}
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

        <div class="amount-words">
          <div class="section-label">Amount in Words</div>
          <div class="amount-words-value">${amountInWords(sale.grandTotal)}</div>
        </div>
        
        <div class="signatory-section">
          <div class="signatory-company">For ${company?.companyName || 'KHM Wholesale'}</div>
          <div class="signatory-line">Authorized Signatory</div>
        </div>

        <div class="footer">
          ${isEstimate ? 'This is an estimate. Not a tax invoice.' : 'Thank you for your business! This is a computer generated tax invoice.'}
        </div>
      </div>
    </body>
    </html>
  `;
};

// Exported for unit testing the bill content without launching a browser.
export { generateHTML };
