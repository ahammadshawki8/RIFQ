// Pre-dial eligibility gate and the suppression list.
//
// This is the control both collections heads asked for: a blocked call never
// reaches telephony, and one suppression list is the single source for the
// bank's own dialer and for any agency file export.

import { POLICY, isPolicyEffective } from '../data/policy.js';

export class SuppressionList {
  constructor() {
    this.entries = new Map(); // customer_id -> { reason, at, until }
    this.blockedAttempts = [];
  }

  add(customerId, reason, at = new Date()) {
    this.entries.set(customerId, { reason, at: at.toISOString() });
    return this.entries.get(customerId);
  }

  has(customerId) {
    return this.entries.has(customerId);
  }

  reasonFor(customerId) {
    return this.entries.get(customerId)?.reason ?? null;
  }

  /** Any dialer, ours or an agency's, must ask before placing a call. */
  checkDialAttempt(customerId, source) {
    const entry = this.entries.get(customerId);
    if (!entry) return { allowed: true };
    const record = {
      customer_id: customerId,
      source,
      blocked_at: new Date().toISOString(),
      reason: entry.reason,
    };
    this.blockedAttempts.push(record);
    return { allowed: false, ...record };
  }

  export() {
    return [...this.entries.entries()].map(([customer_id, v]) => ({ customer_id, ...v }));
  }
}

const CHECKS = [
  {
    id: 'policy_effective',
    label: 'Treatment policy is approved and in date',
    run: ({ now }) => isPolicyEffective(POLICY, now),
    fail: 'Policy bundle is not effective at this time',
  },
  {
    id: 'consent',
    label: 'Contact consent captured',
    run: ({ customer }) => customer.consent === true,
    fail: 'No contact consent on file',
  },
  {
    id: 'not_suppressed',
    label: 'Not on the suppression list',
    run: ({ customer, suppression }) => !customer.opted_out && !suppression.has(customer.id),
    fail: 'Customer is on the suppression list',
  },
  {
    id: 'calling_window',
    label: 'Inside permitted calling hours',
    run: ({ hour }) => hour >= POLICY.contact.window_start_hour && hour < POLICY.contact.window_end_hour,
    fail: 'Outside the permitted calling window',
  },
  {
    id: 'attempts_today',
    label: 'Daily attempt limit not reached',
    run: ({ customer }) => customer.attempts_today < POLICY.contact.max_attempts_per_day,
    fail: 'Daily attempt limit reached',
  },
  {
    id: 'attempts_week',
    label: 'Weekly attempt limit not reached',
    run: ({ customer }) => customer.attempts_this_week < POLICY.contact.max_attempts_per_week,
    fail: 'Weekly attempt limit reached',
  },
  {
    id: 'no_open_case',
    label: 'No open hardship, dispute or complaint case',
    run: ({ customer }) => customer.open_protected_case !== true,
    fail: 'An open protected case exists',
  },
  {
    id: 'language_pack',
    label: 'Approved language pack exists',
    run: ({ customer }) => POLICY.supported_locales.includes(customer.prefers || customer.locale),
    fail: 'No approved language pack for this customer',
  },
];

/**
 * Decide whether a call job may be queued. Returns a machine readable receipt
 * either way, which is what a compliance reviewer reads later.
 */
export function evaluateGate({ customer, hour, suppression, now = new Date() }) {
  const ctx = { customer, hour, suppression, now };
  const checks = CHECKS.map((c) => ({
    id: c.id,
    label: c.label,
    passed: Boolean(c.run(ctx)),
    fail_reason: c.fail,
  }));
  const failed = checks.filter((c) => !c.passed);
  return {
    customer_id: customer.id,
    decision: failed.length === 0 ? 'ALLOWED' : 'BLOCKED',
    evaluated_at: now.toISOString(),
    local_hour: hour,
    policy: `${POLICY.policy_id} v${POLICY.version}`,
    checks,
    block_reasons: failed.map((c) => c.fail_reason),
  };
}
