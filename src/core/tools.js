// Scoped tool gateway.
//
// The agent never touches a bank system directly. It asks the gateway, and the
// gateway checks four things before anything happens: is this tool allowed at
// this workflow node, is there a verified customer where one is required, is the
// policy still effective, and do the parameters match the schema. Duplicate
// requests return the first receipt instead of acting twice.

import { POLICY, isPolicyEffective } from '../data/policy.js';

export class ToolDenied extends Error {
  constructor(reason, detail) {
    super(reason);
    this.name = 'ToolDenied';
    this.reason = reason;
    this.detail = detail;
  }
}

const SCHEMAS = {
  start_verification: { customer_id: 'string' },
  get_verification_status: { session_id: 'string' },
  get_obligation_context: { customer_id: 'string' },
  get_allowed_promise_dates: { customer_id: 'string' },
  record_promise_to_pay: { customer_id: 'string', date: 'string' },
  create_secure_payment_link: { customer_id: 'string' },
  schedule_callback: { customer_id: 'string', slot: 'string' },
  register_voice_optout: { customer_id: 'string' },
  apply_contact_hold: { customer_id: 'string', reason: 'string' },
  create_human_case: { customer_id: 'string', category: 'string', excerpt: 'string' },
  write_audit_event: { note: 'string' },
};

// Actions that change state. Only these are protected by an idempotency key, so
// a retry cannot create a second payment link or a second case. Reads such as a
// verification status must always run, or the agent would never see an approval.
const IDEMPOTENT = new Set([
  'record_promise_to_pay',
  'create_secure_payment_link',
  'schedule_callback',
  'register_voice_optout',
  'apply_contact_hold',
  'create_human_case',
]);

// Tools that may only run once a verified trust context exists.
const NEEDS_VERIFIED = new Set([
  'get_obligation_context',
  'get_allowed_promise_dates',
  'record_promise_to_pay',
  'create_secure_payment_link',
  'schedule_callback',
]);

export class ToolGateway {
  constructor({ suppression, audit, clock }) {
    this.suppression = suppression;
    this.audit = audit;
    this.clock = clock || (() => new Date());
    this.refSeq = 1041;
    this.idempotency = new Map();
    this.cases = [];
    this.verifications = new Map();
    this.receipts = [];
  }

  nextRef(prefix = 'RQ') {
    return `${prefix}-${++this.refSeq}`;
  }

  /** The only way in. ctx = { node, verified, callId, customer } */
  call(name, params, ctx) {
    const allowed = POLICY.node_tools[ctx.node] || [];
    if (!allowed.includes(name)) {
      return this.#deny(name, params, ctx, 'tool_not_available_at_this_step',
        `${name} is not in the tool scope of ${ctx.node}`);
    }
    if (!isPolicyEffective(POLICY, this.clock())) {
      return this.#deny(name, params, ctx, 'policy_not_effective', 'Policy bundle expired');
    }
    if (NEEDS_VERIFIED.has(name) && !ctx.verified) {
      return this.#deny(name, params, ctx, 'not_verified', 'No verified trust context for this call');
    }
    const schemaError = validate(SCHEMAS[name], params);
    if (schemaError) {
      return this.#deny(name, params, ctx, 'schema_rejected', schemaError);
    }

    const key = `${ctx.callId}:${name}:${JSON.stringify(params)}`;
    if (IDEMPOTENT.has(name) && this.idempotency.has(key)) {
      const first = this.idempotency.get(key);
      return { ...first, idempotent_replay: true };
    }

    let result;
    try {
      result = this[`_${name}`](params, ctx);
    } catch (err) {
      return this.#deny(name, params, ctx, 'tool_failed', err.message);
    }

    const receipt = {
      ok: true,
      tool: name,
      workflow_node: ctx.node,
      call_id: ctx.callId,
      policy_version: POLICY.version,
      params: redact(params),
      result,
      idempotency_key: key,
      at: this.clock().toISOString(),
    };
    if (IDEMPOTENT.has(name)) this.idempotency.set(key, receipt);
    this.receipts.push(receipt);
    this.audit?.add('tool', receipt);
    return receipt;
  }

  #deny(name, params, ctx, reason, detail) {
    const receipt = {
      ok: false,
      tool: name,
      workflow_node: ctx.node,
      call_id: ctx.callId,
      reason,
      detail,
      params: redact(params),
      at: this.clock().toISOString(),
    };
    this.receipts.push(receipt);
    this.audit?.add('block', receipt);
    return receipt;
  }

  // ---- tool implementations (mock bank systems) ----

  _start_verification({ customer_id }) {
    const session_id = `ver_${customer_id}_${Date.now()}`;
    this.verifications.set(session_id, { customer_id, approved: false, channel: 'app_push' });
    return { session_id, channel: 'app_push', asks_for_secret: false };
  }

  _get_verification_status({ session_id }) {
    const v = this.verifications.get(session_id);
    if (!v) throw new Error('unknown verification session');
    return { verified: v.approved === true, channel: v.channel };
  }

  /** Called by the customer's bank app, not by the agent. */
  approveVerification(session_id) {
    const v = this.verifications.get(session_id);
    if (v) v.approved = true;
    return Boolean(v);
  }

  _get_obligation_context({ customer_id }, ctx) {
    const o = ctx.customer.obligation;
    return {
      customer_id,
      product: o.product, // already masked to the last four digits
      amount_due: o.amount_due,
      currency: o.currency,
      due_date: o.due_date,
      days_past_due: o.days_past_due,
      treatment: o.treatment,
    };
  }

  _get_allowed_promise_dates({ customer_id }, ctx) {
    const base = new Date(`${ctx.customer.obligation.due_date}T00:00:00Z`);
    const dates = [5, 8, 11].map((d) => {
      const dt = new Date(base);
      dt.setUTCDate(dt.getUTCDate() + d);
      return dt.toISOString().slice(0, 10);
    });
    return { customer_id, dates };
  }

  _record_promise_to_pay({ customer_id, date }, ctx) {
    const { dates } = this._get_allowed_promise_dates({ customer_id }, ctx);
    if (!dates.includes(date)) {
      throw new Error(`date ${date} is outside the allowed set ${dates.join(', ')}`);
    }
    return { reference: this.nextRef(), customer_id, promised_date: date, recorded: true };
  }

  _create_secure_payment_link({ customer_id }) {
    return {
      reference: this.nextRef(),
      customer_id,
      url: 'https://demo-bank.example/pay/' + Math.random().toString(36).slice(2, 10),
      expires_in_minutes: 30,
      hosted_by: 'Demo Bank',
    };
  }

  _schedule_callback({ customer_id, slot }) {
    return { reference: this.nextRef('CB'), customer_id, slot, booked: true };
  }

  _register_voice_optout({ customer_id }) {
    this.suppression.add(customer_id, 'Customer opted out of automated voice calls');
    return { reference: this.nextRef('OP'), customer_id, suppressed: true };
  }

  _apply_contact_hold({ customer_id, reason }) {
    this.suppression.add(customer_id, `Contact hold: ${reason}`);
    return { customer_id, hold: true, reason, applies_to: ['bank dialer', 'agency file export'] };
  }

  _create_human_case({ customer_id, category, excerpt }) {
    const route = POLICY.escalation[category] || POLICY.escalation.complaint;
    const record = {
      case_id: this.nextRef('CASE'),
      customer_id,
      category,
      queue: route.queue,
      owner: route.owner,
      sla_hours: route.sla_hours,
      customer_words: excerpt,
      opened_at: this.clock().toISOString(),
      status: 'open',
    };
    this.cases.push(record);
    return record;
  }

  _write_audit_event({ note }) {
    return { written: true, note };
  }
}

function validate(schema, params) {
  if (!schema) return 'no schema registered for this tool';
  for (const [key, type] of Object.entries(schema)) {
    if (typeof params?.[key] !== type) return `parameter "${key}" must be a ${type}`;
  }
  for (const key of Object.keys(params || {})) {
    if (!(key in schema)) return `parameter "${key}" is not allowed`;
  }
  return null;
}

function redact(params) {
  const clone = { ...(params || {}) };
  if (clone.excerpt && clone.excerpt.length > 90) clone.excerpt = clone.excerpt.slice(0, 90) + '...';
  return clone;
}
