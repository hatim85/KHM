/**
 * GST master data + validation utilities.
 * Backend is authoritative for all GST decisions.
 * State code (2-digit string) drives intra/inter-state logic — never state names.
 */

export const GST_STATE_MASTER = Object.freeze({
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu',
  '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre / Other',
});

export const VALID_GST_RATES = Object.freeze([0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28]);

export const normalizeStateCode = (code) => {
  if (code === null || code === undefined) return '';
  const s = String(code).trim();
  return s.length === 1 ? `0${s}` : s;
};

export const isValidStateCode = (code) => {
  const normalized = normalizeStateCode(code);
  return Object.prototype.hasOwnProperty.call(GST_STATE_MASTER, normalized);
};

export const stateNameForCode = (code) => {
  const normalized = normalizeStateCode(code);
  return GST_STATE_MASTER[normalized] || '';
};

/**
 * GSTIN is optional free text — deliberately NOT format-validated
 * (owner's rule). Stored upper-cased and trimmed for tidy display.
 */

export const normalizeGstin = (gstin) => {
  if (!gstin) return '';
  return String(gstin).trim().toUpperCase();
};

/** Intra-state => CGST+SGST, inter-state => IGST. Decided purely on state codes. */
export const isIntraStateSupply = (companyStateCode, partyStateCode) =>
  normalizeStateCode(companyStateCode) === normalizeStateCode(partyStateCode || companyStateCode);

export const isValidGstRate = (rate) => {
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0 || n > 28) return false;
  return VALID_GST_RATES.includes(n);
};
