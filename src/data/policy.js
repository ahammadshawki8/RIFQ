// Signed policy bundle. In production this is issued by the bank's policy service,
// approved by a named person, and versioned. Nothing regulated is said or done
// unless it traces back to a bundle that is effective at the time of the call.

export const POLICY = {
  policy_id: 'early_arrears_retail',
  version: '1.3.0',
  owner: 'Head of Retail Collections',
  approver: 'Head of Compliance Operations',
  approval_hash: 'sha256:9f2b41c7e08a5d3b',
  effective_from: '2026-09-01T00:00:00Z',
  effective_to: '2027-03-01T00:00:00Z',

  // Contact rules. The gate reads these before a call is ever queued.
  contact: {
    timezone: 'Asia/Dubai',
    window_start_hour: 9,
    window_end_hour: 20,
    max_attempts_per_day: 2,
    max_attempts_per_week: 5,
  },

  // Which administrative outcomes this treatment allows. Anything outside this
  // list has no tool behind it, so the agent cannot perform it.
  allowed_outcomes: ['payment_link', 'promise_to_pay', 'callback', 'human', 'opt_out'],

  // Signals that end the collection conversation and open a human case.
  protected_signals: ['hardship', 'dispute', 'complaint', 'vulnerability'],

  // Which tools each workflow node may call. The gateway rejects anything else,
  // so a prompt cannot talk the agent into a tool it does not hold.
  node_tools: {
    INTRO: ['write_audit_event', 'register_voice_optout'],
    VERIFY: ['start_verification', 'get_verification_status', 'register_voice_optout', 'write_audit_event'],
    DISCLOSE: ['get_obligation_context', 'get_allowed_promise_dates', 'write_audit_event'],
    RESOLVE: [
      'get_allowed_promise_dates',
      'record_promise_to_pay',
      'create_secure_payment_link',
      'schedule_callback',
      'register_voice_optout',
      'write_audit_event',
    ],
    CONFIRM: ['write_audit_event'],
    PROTECTED: ['apply_contact_hold', 'create_human_case', 'write_audit_event'],
    CLOSED: ['write_audit_event'],
  },

  // Escalation routing, including who owns the case and how fast they must act.
  escalation: {
    hardship: { queue: 'Financial difficulty team', owner: 'S. Rahman', sla_hours: 4 },
    dispute: { queue: 'Payment reconciliation', owner: 'A. Haddad', sla_hours: 24 },
    complaint: { queue: 'Complaints', owner: 'M. Youssef', sla_hours: 24 },
    vulnerability: { queue: 'Financial difficulty team', owner: 'S. Rahman', sla_hours: 2 },
    waiver: { queue: 'Collections authority desk', owner: 'K. Aziz', sla_hours: 8 },
    human_request: { queue: 'Collections support', owner: 'N. Farooq', sla_hours: 8 },
  },

  // Speech recognition confidence below this routes to a person instead of guessing.
  confidence_floor: 0.62,

  supported_locales: ['en-AE', 'ar-AE', 'ur-AE'],
};

export function isPolicyEffective(policy, now = new Date()) {
  const t = now.getTime();
  return t >= Date.parse(policy.effective_from) && t <= Date.parse(policy.effective_to);
}
