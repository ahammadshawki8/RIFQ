// Evidence store. Every regulated sentence and every action lands here with the
// policy that authorised it, so a reviewer can click one sentence and see why it
// was allowed to be said.

export class AuditLog {
  constructor() {
    this.events = [];
    this.seq = 0;
  }

  add(type, payload) {
    const event = {
      id: `ev_${String(++this.seq).padStart(3, '0')}`,
      type, // utterance | tool | gate | block | state
      at: new Date().toISOString(),
      ...payload,
    };
    this.events.push(event);
    return event;
  }

  utterances() {
    return this.events.filter((e) => e.type === 'utterance');
  }

  tools() {
    return this.events.filter((e) => e.type === 'tool');
  }

  blocked() {
    return this.events.filter((e) => e.type === 'block');
  }

  /** The package a post-call webhook would send to the bank's evidence store. */
  export(callId) {
    return JSON.stringify({ call_id: callId, generated_at: new Date().toISOString(), events: this.events }, null, 2);
  }
}

/** Receipt for one spoken regulated sentence. */
export function utteranceReceipt({ callId, turn, node, templateId, locale, policy, text, variables }) {
  return {
    call_id: callId,
    turn_id: `turn_${String(turn).padStart(3, '0')}`,
    workflow_node: node,
    template_id: templateId,
    locale,
    policy_id: policy.policy_id,
    policy_version: policy.version,
    approval_hash: policy.approval_hash,
    approver: policy.approver,
    variables: variables || {},
    text,
  };
}
