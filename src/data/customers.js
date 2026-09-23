// Synthetic customers. No real customer data is used anywhere in this prototype.
// Numbers are reserved test numbers, amounts and dates are invented.

export const CUSTOMERS = [
  {
    id: 'cust_001',
    name: 'Imran Qureshi',
    locale: 'en-AE',
    prefers: 'ur-AE', // starts in English, switches to Urdu on the call
    phone: '+971 50 000 0001',
    consent: true,
    opted_out: false,
    attempts_today: 0,
    attempts_this_week: 1,
    open_protected_case: false,
    scenario: 'routine',
    obligation: {
      id: 'obl_001',
      product: 'personal finance account ending 4421',
      amount_due: 850.0,
      currency: 'AED',
      due_date: '2026-10-01',
      days_past_due: 7,
      treatment: 'routine_early_arrears_v1',
    },
  },
  {
    id: 'cust_002',
    name: 'Sara Haddad',
    locale: 'ar-AE',
    prefers: 'ar-AE',
    phone: '+971 50 000 0002',
    consent: true,
    opted_out: false,
    attempts_today: 0,
    attempts_this_week: 2,
    open_protected_case: false,
    scenario: 'hardship',
    obligation: {
      id: 'obl_002',
      product: 'credit card ending 7730',
      amount_due: 1100.0,
      currency: 'AED',
      due_date: '2026-10-07',
      days_past_due: 5,
      treatment: 'routine_early_arrears_v1',
    },
  },
  {
    id: 'cust_003',
    name: 'Layla Mansour',
    locale: 'ar-AE',
    prefers: 'ar-AE',
    phone: '+971 50 000 0003',
    consent: true,
    opted_out: true, // asked never to be called by an automated system
    attempts_today: 0,
    attempts_this_week: 0,
    open_protected_case: false,
    scenario: 'blocked_optout',
    obligation: {
      id: 'obl_003',
      product: 'personal finance account ending 1180',
      amount_due: 620.0,
      currency: 'AED',
      due_date: '2026-10-03',
      days_past_due: 4,
      treatment: 'routine_early_arrears_v1',
    },
  },
  {
    id: 'cust_004',
    name: 'Ravi Nair',
    locale: 'en-AE',
    prefers: 'en-AE',
    phone: '+971 50 000 0004',
    consent: true,
    opted_out: false,
    attempts_today: 2, // already called twice today
    attempts_this_week: 5,
    open_protected_case: false,
    scenario: 'blocked_attempts',
    obligation: {
      id: 'obl_004',
      product: 'credit card ending 9052',
      amount_due: 430.0,
      currency: 'AED',
      due_date: '2026-10-02',
      days_past_due: 6,
      treatment: 'routine_early_arrears_v1',
    },
  },
];

export function getCustomer(id) {
  return CUSTOMERS.find((c) => c.id === id);
}
