export const formatMoney = (amountInPaise) => {
  if (amountInPaise === null || amountInPaise === undefined) return '₹0.00';
  return `₹${(amountInPaise / 100).toFixed(2)}`;
};
