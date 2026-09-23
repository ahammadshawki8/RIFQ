// RIFQ console: wires the governed workflow to the screen.

import { CUSTOMERS } from '../data/customers.js';
import { POLICY } from '../data/policy.js';
import { PACKS } from '../data/packs.js';
import { TEST_RESULTS } from '../data/test-results.js';
import { SuppressionList, evaluateGate } from '../core/gate.js';
import { ToolGateway } from '../core/tools.js';
import { AuditLog } from '../core/audit.js';
import { CallSession, formatDate } from '../core/workflow.js';
import { speak, setVoiceEnabled, primeVoices } from './voice.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = {
  hour: 11,
  customers: JSON.parse(JSON.stringify(CUSTOMERS)),
  suppression: new SuppressionList(),
  session: null,
  gateway: null,
  audit: null,
  customer: null,
  selectedTurn: null,
  speaking: false,
  agencyLog: [],
  glosses: new Map(), // turn index -> English gloss for a non-English reply
};

const CANONICAL_TOOLS = [
  'start_verification',
  'get_verification_status',
  'get_obligation_context',
  'get_allowed_promise_dates',
  'record_promise_to_pay',
  'create_secure_payment_link',
  'schedule_callback',
  'register_voice_optout',
  'apply_contact_hold',
  'create_human_case',
];
const COLLECTION_TOOLS = new Set(['record_promise_to_pay', 'create_secure_payment_link', 'schedule_callback', 'get_allowed_promise_dates']);
const FLOW = ['INTRO', 'VERIFY', 'DISCLOSE', 'RESOLVE', 'CONFIRM'];

// ---------- navigation ----------

function show(view) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  document.querySelectorAll('.navlink').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'evidence') renderEvidence();
  if (view === 'app') renderPhone();
}

document.querySelectorAll('.navlink').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

// ---------- campaign ----------

function renderClock() {
  $('clockReadout').textContent = `${String(state.hour).padStart(2, '0')}:00`;
  $('windowLabel').textContent = `${String(POLICY.contact.window_start_hour).padStart(2, '0')}:00 to ${POLICY.contact.window_end_hour}:00`;
}

function renderQueue() {
  const queue = $('queue');
  queue.innerHTML = '';
  for (const customer of state.customers) {
    const decision = evaluateGate({ customer, hour: state.hour, suppression: state.suppression });
    const allowed = decision.decision === 'ALLOWED';
    const card = el('div', 'card cust');
    const o = customer.obligation;
    card.innerHTML = `
      <div class="spread">
        <div>
          <h3>${esc(customer.name)}</h3>
          <div class="meta">${esc(o.product)} &middot; ${o.currency} ${o.amount_due.toFixed(2)} &middot; ${o.days_past_due} days past due</div>
        </div>
        <span class="pill ${allowed ? '' : 'red'}">${allowed ? 'Allowed' : 'Blocked'}</span>
      </div>
      <div class="row small muted">
        <span class="pill grey">${PACKS[customer.prefers]?.label || 'English'}</span>
        <span class="mono">${esc(customer.phone)}</span>
      </div>`;

    const details = el('details', 'reasons');
    details.innerHTML = `<summary>${allowed ? 'All 8 gate checks passed' : esc(decision.block_reasons.join('. '))}</summary>`;
    const list = el('ul', 'checks');
    for (const c of decision.checks) {
      const li = el('li', c.passed ? '' : 'failed');
      li.innerHTML = `<span class="${c.passed ? 'ok' : 'no'}">${c.passed ? '&#10003;' : '&#10005;'}</span><span>${esc(c.label)}</span>`;
      list.appendChild(li);
    }
    details.appendChild(list);
    card.appendChild(details);

    const btn = el('button', `btn ${allowed ? '' : 'ghost'}`, allowed ? 'Place call' : 'Blocked before dialling');
    btn.disabled = !allowed;
    btn.addEventListener('click', () => startCall(customer));
    card.appendChild(btn);
    queue.appendChild(card);
  }
}

function renderAgencyLog() {
  const box = $('agencyLog');
  if (!state.agencyLog.length) {
    box.innerHTML = '<p class="small muted" style="margin:0">No attempts yet.</p>';
    return;
  }
  box.innerHTML = '';
  for (const entry of [...state.agencyLog].reverse().slice(0, 4)) {
    const banner = el('div', `banner ${entry.allowed ? 'mint' : 'red'}`);
    banner.style.marginBottom = '8px';
    banner.innerHTML = entry.allowed
      ? `<span>Dial allowed for ${esc(entry.name)}. Nothing on the suppression list.</span>`
      : `<span><strong>Blocked.</strong> ${esc(entry.name)} is suppressed: ${esc(entry.reason)}</span>`;
    box.appendChild(banner);
  }
}

$('clock').addEventListener('input', (e) => {
  state.hour = Number(e.target.value);
  renderClock();
  renderQueue();
});

$('agencyDial').addEventListener('click', () => {
  // The agency works from an exported file, so it tries whoever is on it.
  const target = state.customers.find((c) => state.suppression.has(c.id)) || state.customers[0];
  const result = state.suppression.checkDialAttempt(target.id, 'agency dialer export');
  state.agencyLog.push({ name: target.name, allowed: result.allowed, reason: result.reason });
  renderAgencyLog();
});

// ---------- call ----------

function startCall(customer) {
  state.customer = customer;
  state.audit = new AuditLog();
  state.gateway = new ToolGateway({ suppression: state.suppression, audit: state.audit });
  state.session = new CallSession({
    customer,
    gateway: state.gateway,
    audit: state.audit,
    suppression: state.suppression,
    locale: customer.locale,
  });
  state.glosses = new Map();
  state.selectedTurn = null;
  customer.attempts_today += 1;
  customer.attempts_this_week += 1;

  const before = 0;
  state.session.start();
  show('call');
  renderCall();
  speakNew(before);
}

function customerSays(text, intent, gloss) {
  if (!state.session || state.session.node === 'CLOSED') return;
  const before = state.session.turns.length;
  state.session.say(text, intent);
  if (gloss) state.glosses.set(before, gloss);
  renderCall();
  renderQueue();
  speakNew(before);
}

/** Speak every agent line added since `fromIndex`, in order. */
function speakNew(fromIndex) {
  const turns = state.session.turns.slice(fromIndex).filter((t) => t.speaker === 'agent');
  for (const turn of turns) {
    speak(turn.text, turn.locale, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
  }
}

function setSpeaking(on) {
  state.speaking = on;
  $('railWave').classList.toggle('idle', !on);
  const row = $('speakingRow');
  row.innerHTML = on ? '<div class="speaking"><span>RIFQ is speaking</span></div>' : '';
}

function renderCall() {
  const s = state.session;
  const transcript = $('transcript');
  if (!s) return;

  $('callWho').textContent = state.customer.name;
  $('callSub').textContent = `${state.customer.phone} &middot; recorded end to end`.replace('&middot;', '·');
  const chip = $('localeChip');
  chip.hidden = false;
  chip.textContent = PACKS[s.locale].label;

  transcript.innerHTML = '';
  s.turns.forEach((turn, i) => {
    const rtl = PACKS[turn.locale]?.dir === 'rtl';
    const bubble = el('div', `bubble ${turn.speaker} ${rtl ? 'rtl' : ''}`);
    const who = turn.speaker === 'agent' ? 'RIFQ' : state.customer.name.split(' ')[0];
    const gloss = state.glosses.get(i);
    bubble.innerHTML = `<span class="tag">${esc(who)}${turn.speaker === 'agent' ? ` &middot; ${esc(turn.node)}` : ''}</span>${esc(turn.text)}${gloss ? `<span class="gloss">${esc(gloss)}</span>` : ''}`;
    transcript.appendChild(bubble);
  });
  transcript.scrollTop = transcript.scrollHeight;

  // workflow chips
  const chips = $('nodeChips');
  chips.innerHTML = '';
  const reached = FLOW.indexOf(s.node);
  FLOW.forEach((node, i) => {
    let cls = 'node';
    if (s.node === node) cls += ' current';
    else if (reached === -1 ? s.verified && i < 3 : i < reached) cls += ' done';
    chips.appendChild(el('span', cls, node));
  });
  if (s.node === 'PROTECTED' || String(s.outcome?.outcome || '').startsWith('escalated')) {
    chips.appendChild(el('span', 'node protected', 'PROTECTED'));
  }

  // tools
  const allowed = new Set(POLICY.node_tools[s.node] || []);
  const escalated = Boolean(s.caseRecord);
  const list = $('toolList');
  list.innerHTML = '';
  for (const tool of CANONICAL_TOOLS) {
    const on = allowed.has(tool);
    const li = el('li', on ? '' : 'off');
    const badge = on ? '<span class="badge pill">unlocked</span>'
      : escalated && COLLECTION_TOOLS.has(tool) ? '<span class="badge pill red">removed</span>' : '';
    li.innerHTML = `<span>${tool}</span>${badge}`;
    list.appendChild(li);
  }

  // banners
  const banners = $('callBanners');
  banners.innerHTML = '';
  if (s.caseRecord) {
    banners.appendChild(el('div', 'banner gold',
      `<div><strong>Case ${esc(s.caseRecord.case_id)} opened.</strong><br />${esc(s.caseRecord.owner)} in ${esc(s.caseRecord.queue)} owns it, within ${s.caseRecord.sla_hours} hours.</div>`));
  }
  if (state.suppression.has(state.customer.id)) {
    banners.appendChild(el('div', 'banner red',
      `<div><strong>Automated contact paused.</strong><br />${esc(state.suppression.reasonFor(state.customer.id))}. The agency file export reads the same list.</div>`));
  }
  if (s.outcome && !s.caseRecord) {
    banners.appendChild(el('div', 'banner mint',
      `<div><strong>Outcome:</strong> ${esc(s.outcome.outcome.replace(/_/g, ' '))}${s.outcome.reference ? ` &middot; reference ${esc(s.outcome.reference)}` : ''}</div>`));
  }

  // verification state
  const v = state.gateway.verifications.get(s.verificationSession);
  $('verifyState').innerHTML = !s.verificationSession
    ? 'Not started. Nothing about the account can be said yet.'
    : v?.approved
      ? 'Approved in the customer app. Account tools unlocked.'
      : 'Waiting for the customer to approve in their app. No PIN or code is ever requested.';
  $('appDot').hidden = !(s.verificationSession && !v?.approved) && !s.caseRecord;

  // replies
  const replies = $('replies');
  replies.innerHTML = '';
  for (const r of s.suggestions()) {
    const btn = el('button', `reply ${['hardship', 'dispute', 'complaint', 'waiver', 'opt_out'].includes(r.intent) ? 'danger' : ''}`);
    const showGloss = r.gloss && r.gloss !== r.text;
    btn.innerHTML = `${esc(r.text)}${showGloss ? `<span class="g">${esc(r.gloss)}</span>` : ''}`;
    btn.addEventListener('click', () => customerSays(r.raw || r.text, r.intent === 'date' ? undefined : r.intent, showGloss ? r.gloss : null));
    replies.appendChild(btn);
  }
  if (s.node === 'CLOSED') {
    const again = el('button', 'btn ghost sm', 'Back to the campaign gate');
    again.addEventListener('click', () => { show('campaign'); renderQueue(); });
    replies.appendChild(again);
  }
  $('freeText').disabled = s.node === 'CLOSED';
  renderPhone();
}

$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const value = $('freeText').value.trim();
  if (!value) return;
  $('freeText').value = '';
  customerSays(value);
});

$('voiceToggle').addEventListener('change', (e) => setVoiceEnabled(e.target.checked));

// ---------- customer app ----------

function renderPhone() {
  const screen = $('phoneScreen');
  const outcomeBox = $('appOutcome');
  const s = state.session;
  screen.innerHTML = '';
  screen.appendChild(el('div', 'phone-top', `<span>Demo Bank</span><span>${String(state.hour).padStart(2, '0')}:00</span>`));
  screen.appendChild(el('div', 'applogo', 'Demo Bank'));

  if (!s) {
    screen.appendChild(el('div', 'empty', 'Nothing here yet. Place a call from the campaign gate.'));
    outcomeBox.innerHTML = '<div class="kicker">Written outcome</div><p class="small muted" style="margin-top:8px">Anything agreed on the call appears here in writing.</p>';
    return;
  }

  const verification = state.gateway.verifications.get(s.verificationSession);
  if (verification && !verification.approved) {
    const notif = el('div', 'notif');
    notif.innerHTML = `
      <h4>Identity check</h4>
      <p>Demo Bank asked to confirm it is you on the call. This does not authorise a payment, and no PIN or code is needed.</p>`;
    const row = el('div', 'row');
    const approve = el('button', 'btn sm', 'Approve');
    approve.addEventListener('click', () => {
      state.gateway.approveVerification(s.verificationSession);
      renderCall();
      renderPhone();
    });
    const reject = el('button', 'btn ghost sm', 'Not me');
    reject.addEventListener('click', () => { show('call'); customerSays('you have the wrong number', 'wrong_party'); });
    row.append(approve, reject);
    notif.appendChild(row);
    screen.appendChild(notif);
  }

  if (s.caseRecord) {
    const c = s.caseRecord;
    const card = el('div', 'notif');
    card.innerHTML = `<h4>Case ${esc(c.case_id)}</h4><p>${esc(c.queue)}</p>`;
    const tl = el('ul', 'timeline');
    tl.innerHTML = `
      <li><span class="dot"></span><div><strong>You explained your situation</strong><br /><span class="muted">${esc(c.customer_words.slice(0, 70))}</span></div></li>
      <li><span class="dot"></span><div><strong>Collection calls paused</strong><br /><span class="muted">Bank dialer and agency file</span></div></li>
      <li><span class="dot gold"></span><div><strong>${esc(c.owner)} owns this case</strong><br /><span class="muted">Will contact you within ${c.sla_hours} hours</span></div></li>`;
    card.appendChild(tl);
    screen.appendChild(card);
  }

  if (s.outcome && s.outcome.reference && !s.caseRecord) {
    const o = s.outcome;
    const card = el('div', 'notif');
    card.innerHTML = `<h4>${esc(o.outcome.replace(/_/g, ' '))}</h4><p>Reference ${esc(o.reference)}</p>`;
    screen.appendChild(card);
  }

  if (!verification?.approved && !s.caseRecord && !s.outcome) {
    screen.appendChild(el('div', 'empty', 'Waiting for the call to reach a decision.'));
  }

  outcomeBox.innerHTML = s.outcome
    ? `<div class="kicker">Written outcome</div>
       <p class="small" style="margin-top:8px"><strong>${esc(s.outcome.outcome.replace(/_/g, ' '))}</strong>${s.outcome.reference ? ` &middot; ${esc(s.outcome.reference)}` : ''}</p>
       <p class="small muted">Nothing was agreed verbally that the customer cannot see in writing.</p>`
    : '<div class="kicker">Written outcome</div><p class="small muted" style="margin-top:8px">Anything agreed on the call appears here in writing.</p>';
}

// ---------- evidence ----------

function renderEvidence() {
  const list = $('turnList');
  const table = $('toolTable');
  list.innerHTML = '';
  if (!state.session) {
    list.innerHTML = '<li class="muted small">No call yet.</li>';
    table.innerHTML = '<tr><td colspan="4" class="muted">No actions yet.</td></tr>';
    $('receiptPane').textContent = 'Select a line on the left.';
    return;
  }
  state.session.turns.forEach((turn, i) => {
    const li = el('li');
    const btn = el('button', state.selectedTurn === i ? 'sel' : '');
    btn.innerHTML = `<span class="who">${turn.speaker === 'agent' ? 'RIFQ' : 'Customer'}${turn.receipt ? ` &middot; ${esc(turn.receipt.template_id)}` : ''}</span><div>${esc(turn.text)}</div>`;
    btn.addEventListener('click', () => { state.selectedTurn = i; renderEvidence(); });
    li.appendChild(btn);
    list.appendChild(li);
  });

  const turn = state.session.turns[state.selectedTurn];
  const pane = $('receiptPane');
  if (!turn) pane.textContent = 'Select a line on the left.';
  else if (!turn.receipt) pane.innerHTML = '<p class="small muted">This is what the customer said. It is stored in the transcript and in the case, but it carries no policy authority of its own.</p>';
  else {
    const r = turn.receipt;
    pane.className = 'receipt';
    pane.innerHTML = `
      ${line('Spoken', r.text)}
      ${line('Template', r.template_id)}
      ${line('Language', r.locale)}
      ${line('Workflow node', r.workflow_node)}
      ${line('Policy', `${r.policy_id} v${r.policy_version}`)}
      ${line('Approved by', r.approver)}
      ${line('Approval hash', r.approval_hash)}
      ${line('Turn', r.turn_id)}
      ${Object.keys(r.variables || {}).length ? line('Variables', JSON.stringify(r.variables)) : ''}`;
  }

  const receipts = state.gateway.receipts;
  table.innerHTML = receipts.length
    ? receipts.map((r) => `<tr>
        <td class="mono">${esc(r.tool)}</td>
        <td class="mono">${esc(r.workflow_node)}</td>
        <td class="${r.ok ? 'ok' : 'no'}">${r.ok ? (r.idempotent_replay ? 'replay' : 'done') : 'refused'}</td>
        <td class="small muted">${esc(r.ok ? summarise(r.result) : `${r.reason}: ${r.detail}`)}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="muted">No actions yet.</td></tr>';
}

const line = (k, v) => `<div class="line"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`;

function summarise(result) {
  if (!result || typeof result !== 'object') return String(result ?? '');
  if (result.reference) return `reference ${result.reference}`;
  if (result.case_id) return `${result.case_id} to ${result.owner}, ${result.sla_hours}h`;
  if (result.amount_due) return `${result.currency} ${result.amount_due.toFixed(2)} due ${formatDate(result.due_date)}`;
  if (result.dates) return result.dates.map(formatDate).join(', ');
  if (result.session_id) return 'app push sent, no secret requested';
  if (result.hold) return `hold applied for ${result.reason}`;
  return Object.entries(result).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ');
}

$('downloadEvidence').addEventListener('click', () => {
  if (!state.audit) return;
  const blob = new Blob([state.audit.export(state.session.callId)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.session.callId}-evidence.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- tests ----------

function renderTests() {
  $('passRate').textContent = `${TEST_RESULTS.pass_rate}%`;
  $('passCount').textContent = `${TEST_RESULTS.totals.passed} of ${TEST_RESULTS.totals.runs} runs`;
  $('testMeta').innerHTML = `${esc(TEST_RESULTS.policy)} &middot; ${TEST_RESULTS.runs_per_scenario} runs per scenario &middot; generated ${esc(TEST_RESULTS.generated_at.slice(0, 10))}`;

  const bars = $('langBars');
  bars.innerHTML = '';
  for (const [lang, v] of Object.entries(TEST_RESULTS.by_language)) {
    const row = el('div');
    row.style.marginBottom = '10px';
    row.innerHTML = `<div class="spread small"><span>${esc(lang)}</span><span class="mono">${v.pass_rate}%</span></div>
      <div class="bar"><span style="width:${v.pass_rate}%"></span></div>`;
    bars.appendChild(row);
  }

  const rows = TEST_RESULTS.scenarios.map((s) => `<tr>
      <td class="mono">${esc(s.id)}</td>
      <td>${esc(s.name)}</td>
      <td>${esc(s.locale)}</td>
      <td class="${s.passed === s.runs ? 'ok' : 'no'}">${s.passed}/${s.runs}</td>
    </tr>`).join('');
  const gate = TEST_RESULTS.gate.map((g) => `<tr>
      <td class="mono">${esc(g.id)}</td>
      <td>${esc(g.name)}</td>
      <td>gate</td>
      <td class="${g.passed ? 'ok' : 'no'}">${g.passed ? 'pass' : 'fail'}</td>
    </tr>`).join('');
  $('testTable').innerHTML = rows + gate;
}

// ---------- boot ----------

primeVoices();
$('policyChip').textContent = `${POLICY.policy_id} v${POLICY.version}`;
renderClock();
renderQueue();
renderAgencyLog();
renderTests();
renderPhone();
