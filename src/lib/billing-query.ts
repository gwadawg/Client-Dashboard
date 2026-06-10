// Voided billings stay in the ledger for audit but are excluded from operational queries.

export const VOIDED_BILLING_STATUS = 'voided' as const;
