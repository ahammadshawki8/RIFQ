// The governed call workflow.
//
// The conversation is a state machine, not a free-running model. Each node can
// only reach certain nodes, and can only call the tools its policy scope lists.
// That is what makes "hardship stops collection" a property of the system rather
// than a request in a prompt.

import { POLICY } from '../data/policy.js';
import { PACKS, REPLIES, TRIGGERS } from '../data/packs.js';
import { utteranceReceipt } from './audit.js';

export const NODES = ['INTRO', 'VERIFY', 'DISCLOSE', 'RESOLVE', 'CONFIRM', 'PROTECTED', 'CLOSED'];

const PROTECTED_INTENTS = new Set(['hardship', 'dispute', 'complaint', 'waiver']);

export class CallSession {
  constructor({ customer, gateway, audit, suppression, locale, clock }) {
    this.customer = customer;
    this.gateway = gateway;
    this.audit = audit;
    this.suppression = suppression;
    this.clock = clock || (() => new Date());
    this.callId = `call_${customer.id}_${Math.random().toString(36).slice(2, 7)}`;
    this.locale = locale || customer.locale;
    this.node = 'INTRO';
    this.verified = false;
    this.turns = [];
    this.turnCount = 0;
    this.outcome = null;
    this.caseRecord = null;
    this.lastPrompt = null;
    this.awaitingDate = null;
    this.verificationSession = null;
    this.verifyAttempts = 0;
    this.obligation = null;
    this.started = false;
  }

  // ---- speech ----

  text(templateId) {
    return PACKS[this.locale]?.t[templateId] ?? PACKS['en-AE'].t[templateId] ?? '';
  }

  speak(templateId, vars = {}, { prompt = true } = {}) {
    const fill = (tpl) => (tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
    const rendered = fill(this.text(templateId));
    // The same line from the English pack, used for the on-screen gloss and as a
    // voice fallback on a device with no Arabic or Urdu voice installed.
    const enText = this.locale === 'en-AE' ? null : fill(PACKS['en-AE'].t[templateId]);
    this.turnCount += 1;
    const receipt = utteranceReceipt({
      callId: this.callId,
      turn: this.turnCount,
      node: this.node,
      templateId: `${templateId}.${PACKS[this.locale].short.toLowerCase()}`,
      locale: this.locale,
      policy: POLICY,
      text: rendered,
      variables: vars,
    });
    const turn = { speaker: 'agent', text: rendered, en_text: enText, locale: this.locale, node: this.node, receipt, at: this.clock().toISOString() };
    this.turns.push(turn);
    this.audit?.add('utterance', receipt);
    if (prompt) this.lastPrompt = { templateId, vars };
    return turn;
  }

  hear(text, intent) {
    this.turns.push({ speaker: 'customer', text, intent, locale: this.locale, node: this.node, at: this.clock().toISOString() });
  }

  tool(name, params) {
    return this.gateway.call(name, params, {
      node: this.node,
      verified: this.verified,
      callId: this.callId,
      customer: this.customer,
    });
  }

  // ---- lifecycle ----

  start() {
    this.started = true;
    this.tool('write_audit_event', { note: `call started under ${POLICY.policy_id} v${POLICY.version}` });
    this.speak('intro');
    return this.snapshot();
  }

  /** Free text or a suggested reply. Returns the updated snapshot. */
  say(text, forcedIntent) {
    if (this.node === 'CLOSED') return this.snapshot();
    const { intent, confidence } = forcedIntent
      ? { intent: forcedIntent, confidence: 1 }
      : classify(text);
    this.hear(text, intent);

    if (intent && intent.startsWith('switch_')) return this.#switchLanguage(intent);
    if (PROTECTED_INTENTS.has(intent)) return this.#protect(intent, text);
    // Picking one of the dates the server offered is a structured choice, not free speech.
    if (this.awaitingDate) {
      const picked = this.awaitingDate.find((d) => text.includes(d) || text.includes(formatDate(d)) || text.includes(formatDate(d, this.locale)));
      if (picked) return this.#promise(picked);
    }
    if (confidence < POLICY.confidence_floor && !forcedIntent) return this.#lowConfidence(text);

    switch (this.node) {
      case 'INTRO':
        return this.#atIntro(intent, text);
      case 'VERIFY':
        return this.#atVerify(intent, text);
      case 'RESOLVE':
        return this.#atResolve(intent, text);
      default:
        return this.#lowConfidence(text);
    }
  }

  // ---- nodes ----

  #atIntro(intent, text) {
    if (intent === 'wrong_party') {
      this.speak('wrong_party_end');
      return this.#close('wrong_party');
    }
    if (intent === 'opt_out') return this.#optOut();
    if (intent === 'human') return this.#toHuman(text);
    // Right party. Nothing about the account has been said yet, and cannot be:
    // the obligation tool is not in this node's scope.
    this.node = 'VERIFY';
    const started = this.tool('start_verification', { customer_id: this.customer.id });
    this.verificationSession = started.ok ? started.result.session_id : null;
    this.speak('verify_request');
    return this.snapshot();
  }

  #atVerify(intent, text) {
    if (intent === 'ask_otp') {
      this.speak('never_secrets');
      return this.snapshot();
    }
    if (intent === 'opt_out') return this.#optOut();
    if (intent === 'human') return this.#toHuman(text);

    const status = this.tool('get_verification_status', { session_id: this.verificationSession || 'none' });
    if (status.ok && status.result.verified) {
      this.verified = true;
      this.speak('verify_success', {}, { prompt: false });
      return this.#disclose();
    }
    this.verifyAttempts += 1;
    if (this.verifyAttempts >= 2) {
      this.speak('verify_failed');
      return this.#close('verification_failed');
    }
    this.speak('verify_pending');
    return this.snapshot();
  }

  #disclose() {
    this.node = 'DISCLOSE';
    const ctx = this.tool('get_obligation_context', { customer_id: this.customer.id });
    if (!ctx.ok) {
      this.speak('tool_failure');
      return this.#close('tool_failure');
    }
    this.obligation = ctx.result;
    this.speak('facts', {
      amount: `${ctx.result.currency} ${ctx.result.amount_due.toFixed(2)}`,
      product: ctx.result.product,
      date: formatDate(ctx.result.due_date, this.locale),
    }, { prompt: false });
    this.node = 'RESOLVE';
    this.speak('options');
    return this.snapshot();
  }

  #atResolve(intent, text) {
    switch (intent) {
      case 'promise': {
        const dates = this.tool('get_allowed_promise_dates', { customer_id: this.customer.id });
        if (!dates.ok) return this.#toolFailed();
        this.awaitingDate = dates.result.dates;
        const sep = this.locale === 'en-AE' ? ', ' : '، ';
        this.speak('ask_promise_date', { dates: dates.result.dates.map((d) => formatDate(d, this.locale)).join(sep) });
        return this.snapshot();
      }
      case 'payment_link': {
        const link = this.tool('create_secure_payment_link', { customer_id: this.customer.id });
        if (!link.ok) return this.#toolFailed();
        this.node = 'CONFIRM';
        this.speak('confirm_link', { ref: link.result.reference }, { prompt: false });
        return this.#close('payment_link', link.result.reference);
      }
      case 'callback': {
        const cb = this.tool('schedule_callback', { customer_id: this.customer.id, slot: 'tomorrow 10:00 to 12:00' });
        if (!cb.ok) return this.#toolFailed();
        this.node = 'CONFIRM';
        this.speak('confirm_callback', { date: 'tomorrow between 10:00 and 12:00', ref: cb.result.reference }, { prompt: false });
        return this.#close('callback', cb.result.reference);
      }
      case 'opt_out':
        return this.#optOut();
      case 'human':
        return this.#toHuman(text);
      default:
        return this.#lowConfidence(text);
    }
  }

  #promise(date) {
    const rec = this.tool('record_promise_to_pay', { customer_id: this.customer.id, date });
    if (!rec.ok) return this.#toolFailed();
    this.awaitingDate = null;
    this.node = 'CONFIRM';
    this.speak('confirm_promise', { date: formatDate(date, this.locale), ref: rec.result.reference }, { prompt: false });
    return this.#close('promise_to_pay', rec.result.reference);
  }

  /** Hardship, dispute, complaint or an unsupported request such as a waiver. */
  #protect(intent, text) {
    const ackByIntent = {
      hardship: 'hardship_ack',
      dispute: 'dispute_ack',
      complaint: 'complaint_ack',
      waiver: 'unsupported_ack',
    };
    this.node = 'PROTECTED'; // collection tools are not in this node's scope
    this.awaitingDate = null;
    this.speak(ackByIntent[intent], {}, { prompt: false });

    const hold = this.tool('apply_contact_hold', { customer_id: this.customer.id, reason: intent });
    const category = intent === 'waiver' ? 'waiver' : intent;
    const humanCase = this.tool('create_human_case', {
      customer_id: this.customer.id,
      category,
      excerpt: text,
    });
    if (!humanCase.ok) {
      this.speak('tool_failure');
      return this.#close('escalation_failed');
    }
    this.caseRecord = humanCase.result;
    this.speak('transfer_owner', {
      owner: humanCase.result.owner,
      queue: humanCase.result.queue,
      sla: humanCase.result.sla_hours,
      ref: humanCase.result.case_id,
    }, { prompt: false });
    this.contactHold = hold.ok ? hold.result : null;
    return this.#close(`escalated_${category}`, humanCase.result.case_id);
  }

  #toHuman(text) {
    this.node = 'PROTECTED';
    this.speak('human_ack', {}, { prompt: false });
    const humanCase = this.tool('create_human_case', {
      customer_id: this.customer.id,
      category: 'human_request',
      excerpt: text || 'customer asked for a person',
    });
    this.caseRecord = humanCase.ok ? humanCase.result : null;
    if (humanCase.ok) {
      this.speak('transfer_owner', {
        owner: humanCase.result.owner,
        queue: humanCase.result.queue,
        sla: humanCase.result.sla_hours,
        ref: humanCase.result.case_id,
      }, { prompt: false });
    }
    return this.#close('human_transfer', this.caseRecord?.case_id);
  }

  #optOut() {
    const res = this.tool('register_voice_optout', { customer_id: this.customer.id });
    if (!res.ok) return this.#toolFailed();
    this.node = 'CONFIRM';
    this.speak('optout_ack', { ref: res.result.reference }, { prompt: false });
    return this.#close('opt_out', res.result.reference);
  }

  #lowConfidence(text) {
    this.speak('low_confidence', {}, { prompt: false });
    return this.#toHuman(text);
  }

  #toolFailed() {
    this.speak('tool_failure', {}, { prompt: false });
    return this.#close('tool_failure');
  }

  #switchLanguage(intent) {
    const map = { switch_ur: 'ur-AE', switch_ar: 'ar-AE', switch_en: 'en-AE' };
    const next = map[intent];
    if (!POLICY.supported_locales.includes(next)) {
      this.speak('low_confidence', {}, { prompt: false });
      return this.#toHuman('unsupported language');
    }
    this.locale = next;
    this.speak('language_switch_ack', {}, { prompt: false });
    // The workflow state does not move. The same prompt is repeated from the
    // approved pack for the new language, so nothing is translated on the fly.
    if (this.lastPrompt) this.speak(this.lastPrompt.templateId, this.lastPrompt.vars);
    return this.snapshot();
  }

  #close(outcome, reference) {
    // Some templates already end the call politely; do not say goodbye twice.
    const alreadyClosed = ['wrong_party', 'verification_failed'].includes(outcome);
    if (this.node !== 'PROTECTED' && !alreadyClosed) this.speak('closing', {}, { prompt: false });
    this.node = 'CLOSED';
    this.outcome = { outcome, reference: reference || null, at: this.clock().toISOString() };
    this.tool('write_audit_event', { note: `call closed with outcome ${outcome}` });
    return this.snapshot();
  }

  // ---- view for the UI and the tests ----

  suggestions() {
    if (this.node === 'CLOSED') return [];
    if (this.awaitingDate) {
      return this.awaitingDate.map((d) => ({ intent: 'date', text: formatDate(d, this.locale), gloss: formatDate(d), raw: d }));
    }
    const short = PACKS[this.locale].short.toLowerCase();
    const key = this.node === 'DISCLOSE' || this.node === 'CONFIRM' ? 'RESOLVE' : this.node;
    return (REPLIES[key] || []).map((r) => ({
      intent: r.intent,
      text: short === 'en' ? r.en : r[short] || r.en,
      gloss: r.en,
    }));
  }

  snapshot() {
    return {
      call_id: this.callId,
      node: this.node,
      locale: this.locale,
      verified: this.verified,
      tools: POLICY.node_tools[this.node] || [],
      turns: this.turns,
      outcome: this.outcome,
      case: this.caseRecord,
      obligation: this.obligation,
      suggestions: this.suggestions(),
      awaiting_date: this.awaitingDate,
    };
  }
}

/** Keyword classifier standing in for Scribe v2 keyterm biasing plus intent detection. */
export function classify(text) {
  const t = (text || '').toLowerCase().trim();
  if (!t) return { intent: null, confidence: 0 };
  const order = [
    'hardship', 'dispute', 'complaint', 'opt_out', 'wrong_party', 'waiver', 'human',
    'switch_ur', 'switch_ar', 'switch_en', 'ask_otp', 'payment_link', 'promise', 'callback', 'approved', 'affirm',
  ];
  for (const intent of order) {
    const hit = (TRIGGERS[intent] || []).some((k) => t.includes(k.toLowerCase()));
    if (hit) return { intent, confidence: 0.94 };
  }
  return { intent: null, confidence: 0.3 };
}

/** Dates read naturally in each language, with Latin digits so amounts and dates match. */
export function formatDate(iso, locale = 'en-AE') {
  const d = new Date(`${iso}T00:00:00Z`);
  const tag = { 'ar-AE': 'ar-AE-u-nu-latn', 'ur-AE': 'ur-PK-u-nu-latn' }[locale] || 'en-GB';
  try {
    return d.toLocaleDateString(tag, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  } catch {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  }
}
