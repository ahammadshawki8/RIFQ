// RIFQ console: wires the governed workflow to the screen.

import { CUSTOMERS } from '../data/customers.js';
import { POLICY } from '../data/policy.js';
import { PACKS } from '../data/packs.js';
import { TEST_RESULTS } from '../data/test-results.js';
import { SuppressionList, evaluateGate } from '../core/gate.js';
import { ToolGateway } from '../core/tools.js';
import { AuditLog } from '../core/audit.js';
import { CallSession, formatDate } from '../core/workflow.js';
import { voice, primeVoices, voiceReport } from './voice.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = {
  view: 'campaign',
  hour: 11,
  customers: JSON.parse(JSON.stringify(CUSTOMERS)),
  suppression: new SuppressionList(),
  session: null,
  gateway: null,
  audit: null,
  customer: null,
  selectedTurn: null,
  agencyLog: [],
  glosses: new Map(),
  guided: true,
  step: 0,
  speaking: false,
  callStart: null,
};

const FLOW = [
  { node: 'INTRO', name: 'Disclose', what: 'AI and recording, nothing about the account' },
  { node: 'VERIFY', name: 'Verify', what: 'In-app approval, never a secret' },
  { node: 'DISCLOSE', name: 'Inform', what: 'Approved wording, masked product' },
  { node: 'RESOLVE', name: 'Resolve', what: 'Only the approved administrative options' },
  { node: 'CONFIRM', name: 'Confirm', what: 'Read back with a reference' },
];

const TOOL_CAPTIONS = {
  start_verification: 'send app request',
  get_verification_status: 'read approval',
  get_obligation_context: 'masked facts',
  get_allowed_promise_dates: 'dates from the bank',
  record_promise_to_pay: 'record a date',
  create_secure_payment_link: 'send a link',
  schedule_callback: 'book a callback',
  register_voice_optout: 'stop automated calls',
  apply_contact_hold: 'pause contact',
  create_human_case: 'open an owned case',
};
const CANONICAL_TOOLS = Object.keys(TOOL_CAPTIONS);
const COLLECTION_TOOLS = new Set(['get_allowed_promise_dates', 'record_promise_to_pay', 'create_secure_payment_link', 'schedule_callback']);

// ---------- guided walkthrough ----------

const STEPS = [
  {
    view: 'campaign',
    title: 'Move the clock to 20:00.',
    hint: 'Every call turns blocked before anything dials.',
    done: () => state.hour >= POLICY.contact.window_end_hour || state.hour < POLICY.contact.window_start_hour,
  },
  {
    view: 'campaign',
    title: 'Bring it back inside hours and call Sara Haddad.',
    hint: 'Arabic speaker, five days past due.',
    done: () => Boolean(state.session),
  },
  {
    view: 'call',
    title: 'Answer as the customer.',
    hint: 'Nothing about the account has been said yet, and cannot be.',
    done: () => state.session && state.session.node !== 'INTRO',
  },
  {
    view: 'app',
    title: 'Approve the identity check in the bank app.',
    hint: 'No PIN, no one time code. Then answer the agent again.',
    done: () => state.session?.verified,
  },
  {
    view: 'call',
    title: 'Say "I lost my job last week".',
    hint: 'Watch the collection tools disappear on the right.',
    done: () => Boolean(state.session?.caseRecord),
  },
  {
    view: 'campaign',
    title: 'Let the agency dialer try this customer.',
    hint: 'It reads the same suppression list, so it is refused.',
    done: () => state.agencyLog.some((a) => !a.allowed),
  },
  {
    view: 'evidence',
    title: 'Open any sentence the agent spoke.',
    hint: 'Template, policy version, approver, hash.',
    done: () => state.selectedTurn !== null && Boolean(state.session?.turns[state.selectedTurn]?.receipt),
  },
  {
    view: 'tests',
    title: 'Check the numbers behind it.',
    hint: 'Every scenario, three runs, reported per language.',
    done: () => state.view === 'tests' && Boolean(state.session),
  },
];

function renderCoach() {
  const coach = $('coach');
  if (!state.guided) {
    coach.hidden = true;
    return;
  }
  // Work out where the walkthrough really is: the first step still outstanding,
  // and never behind something the judge has already done out of order.
  let idx = 0;
  while (idx < STEPS.length && STEPS[idx].done()) idx += 1;
  for (let i = STEPS.length - 1; i > idx; i -= 1) {
    if (STEPS[i].done()) { idx = i + 1; break; }
  }
  state.step = idx;
  const finished = state.step >= STEPS.length;
  coach.hidden = false;
  const step = finished ? null : STEPS[state.step];
  $('coachStep').textContent = finished ? 'Walkthrough complete' : `Step ${state.step + 1} of ${STEPS.length}`;
  $('coachTitle').textContent = finished ? 'That is the whole loop.' : step.title;
  $('coachHint').textContent = finished
    ? 'Call Imran for the routine path, or try to break it: offer an OTP, ask for a waiver, or type a prompt injection.'
    : step.hint;
  const dots = $('coachDots');
  dots.innerHTML = '';
  STEPS.forEach((_, i) => dots.appendChild(el('i', i < state.step ? 'done' : i === state.step ? 'now' : '')));
  $('coachGo').hidden = finished;
  $('coachGo').textContent = step && step.view === state.view ? 'I am here' : 'Take me there';
}

$('coachGo').addEventListener('click', () => {
  const step = STEPS[state.step];
  if (step) show(step.view);
});

$('guideToggle').addEventListener('change', (e) => {
  state.guided = e.target.checked;
  renderCoach();
});

// ---------- navigation and chrome ----------

function show(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  document.querySelectorAll('.navlink').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'evidence') renderEvidence();
  if (view === 'app') renderPhone();
  if (view === 'call') renderCall();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderCoach();
}

document.querySelectorAll('.navlink').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

const waveBars = [];
(function buildWave() {
  const wave = $('wave');
  for (let i = 0; i < 16; i++) {
    const bar = el('span');
    wave.appendChild(bar);
    waveBars.push(bar);
  }
})();

let waveTimer = null;
function setSpeaking(on) {
  state.speaking = on;
  $('wave').classList.toggle('on', on);
  $('typingRow').innerHTML = on
    ? '<div class="typing"><span class="dots3"><i></i><i></i><i></i></span> RIFQ is speaking</div>'
    : '';
  clearInterval(waveTimer);
  if (on) {
    waveTimer = setInterval(() => {
      waveBars.forEach((b) => { b.style.height = `${4 + Math.random() * 15}px`; });
    }, 130);
  } else {
    waveBars.forEach((b, i) => { b.style.height = `${4 + (i % 3)}px`; });
  }
}

function renderTopbar() {
  $('tbPolicy').textContent = `${POLICY.policy_id} v${POLICY.version}`;
  $('policyChip').textContent = `${POLICY.policy_id} v${POLICY.version}`;
  const s = state.session;
  $('tbCall').innerHTML = !s
    ? 'No call in progress'
    : s.node === 'CLOSED'
      ? `Call with <strong>${esc(state.customer.name)}</strong> closed &middot; ${esc(s.outcome?.outcome.replace(/_/g, ' '))}`
      : `On a call with <strong>${esc(state.customer.name)}</strong> &middot; ${esc(PACKS[s.locale].label)}`;
  const engine = voice.engineFor(s?.locale || 'en-AE');
  $('tbVoice').textContent = voice.enabled ? engine.label.toLowerCase() : 'voice off';
  $('flagCall').hidden = !(s && s.node !== 'CLOSED');
  $('flagEvidence').hidden = !(s && s.node === 'CLOSED');
}

let timerHandle = null;
function tickTimer() {
  if (!state.callStart) return;
  const secs = Math.floor((Date.now() - state.callStart) / 1000);
  $('callTimer').textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

// ---------- campaign ----------

function renderClock() {
  $('clockReadout').textContent = `${String(state.hour).padStart(2, '0')}:00`;
  const open = state.hour >= POLICY.contact.window_start_hour && state.hour < POLICY.contact.window_end_hour;
  const chip = $('windowChip');
  chip.className = `chip ${open ? '' : 'red'}`;
  chip.textContent = open ? 'Inside permitted hours' : 'Outside permitted hours';
  const gauge = $('gauge');
  gauge.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const inWindow = h >= POLICY.contact.window_start_hour && h < POLICY.contact.window_end_hour;
    const bar = el('i', `${inWindow ? 'open' : ''}${h === state.hour ? ` now${inWindow ? '' : ' shut'}` : ''}`);
    bar.title = `${String(h).padStart(2, '0')}:00`;
    gauge.appendChild(bar);
  }
}

function renderQueue() {
  const queue = $('queue');
  queue.innerHTML = '';
  let allowedCount = 0;
  for (const customer of state.customers) {
    const decision = evaluateGate({ customer, hour: state.hour, suppression: state.suppression });
    const allowed = decision.decision === 'ALLOWED';
    if (allowed) allowedCount += 1;
    const o = customer.obligation;
    const row = el('div', `qrow ${allowed ? '' : 'blocked'} ${state.step === 1 && customer.id === 'cust_002' && allowed ? 'target' : ''}`);
    row.append(
      el('div', `avatar ${allowed ? '' : 'blocked'}`, esc(customer.name[0])),
      el('div', '', `
        <h3>${esc(customer.name)}</h3>
        <div class="qmeta">${esc(o.product)} &middot; <b>${o.currency} ${o.amount_due.toFixed(2)}</b> &middot; ${o.days_past_due} days past due &middot; ${esc(PACKS[customer.prefers]?.label || 'English')}</div>`),
    );

    const action = el('div', 'qaction');
    action.appendChild(el('span', `chip ${allowed ? '' : 'red'}`, allowed ? 'Callable' : 'Blocked'));
    const btn = el('button', `btn ${allowed ? '' : 'ghost'} sm`, allowed ? 'Place call' : 'Not queued');
    btn.disabled = !allowed;
    btn.addEventListener('click', () => startCall(customer));
    action.appendChild(btn);
    row.appendChild(action);

    const details = el('details', 'reasons');
    details.innerHTML = `<summary>${allowed ? 'All eight checks passed' : esc(decision.block_reasons.join('. '))}</summary>`;
    const list = el('ul', 'checks');
    for (const c of decision.checks) {
      list.appendChild(el('li', c.passed ? '' : 'failed',
        `<span class="${c.passed ? 'tick' : 'cross'}">${c.passed ? '&#10003;' : '&#10005;'}</span><span>${esc(c.label)}</span>`));
    }
    details.appendChild(list);
    row.appendChild(details);
    queue.appendChild(row);
  }
  $('statAllowed').textContent = allowedCount;
  $('statBlocked').textContent = state.customers.length - allowedCount;
  $('queueNote').textContent = `${state.customers.length} synthetic customers on reserved test numbers. A blocked row never reaches the dialer, and the block receipt is stored with the reason.`;

  const legend = $('gateLegend');
  if (!legend.childElementCount) {
    const sample = evaluateGate({ customer: state.customers[0], hour: 11, suppression: state.suppression });
    for (const c of sample.checks) {
      legend.appendChild(el('li', '', `<span class="tick">&#10003;</span><span>${esc(c.label)}</span>`));
    }
  }
}

function renderAgencyLog() {
  const box = $('agencyLog');
  if (!state.agencyLog.length) {
    box.innerHTML = '<p class="small muted" style="margin:0">No attempts yet.</p>';
    return;
  }
  box.innerHTML = '';
  for (const entry of [...state.agencyLog].reverse().slice(0, 3)) {
    box.appendChild(el('div', `banner ${entry.allowed ? 'mint' : 'red'}`, entry.allowed
      ? `<b>Dial allowed</b>${esc(entry.name)} is not on the suppression list.`
      : `<b>Refused</b>${esc(entry.name)}: ${esc(entry.reason)}`));
  }
}

$('clock').addEventListener('input', (e) => {
  state.hour = Number(e.target.value);
  renderClock();
  renderQueue();
  renderPhone();
  renderCoach();
});

$('agencyDial').addEventListener('click', () => {
  const target = state.customers.find((c) => state.suppression.has(c.id))
    || state.customers.find((c) => c.opted_out)
    || state.customers[0];
  const result = state.suppression.checkDialAttempt(target.id, 'agency dialer export');
  state.agencyLog.push({ name: target.name, allowed: result.allowed !== false, reason: result.reason || '' });
  renderAgencyLog();
  renderCoach();
});

$('resetBtn').addEventListener('click', () => {
  voice.stop();
  clearInterval(timerHandle);
  Object.assign(state, {
    hour: 11,
    customers: JSON.parse(JSON.stringify(CUSTOMERS)),
    suppression: new SuppressionList(),
    session: null, gateway: null, audit: null, customer: null,
    selectedTurn: null, agencyLog: [], glosses: new Map(), step: 0, callStart: null,
  });
  $('clock').value = 11;
  setSpeaking(false);
  renderAll();
  show('campaign');
});

// ---------- call ----------

function startCall(customer) {
  voice.stop();
  state.customer = customer;
  state.audit = new AuditLog();
  state.gateway = new ToolGateway({ suppression: state.suppression, audit: state.audit });
  state.session = new CallSession({
    customer, gateway: state.gateway, audit: state.audit, suppression: state.suppression, locale: customer.locale,
  });
  state.glosses = new Map();
  state.selectedTurn = null;
  customer.attempts_today += 1;
  customer.attempts_this_week += 1;
  state.callStart = Date.now();
  clearInterval(timerHandle);
  timerHandle = setInterval(tickTimer, 1000);

  state.session.start();
  show('call');
  renderCall();
  renderQueue();
  speakNew(0);
}

function customerSays(text, intent, gloss) {
  const s = state.session;
  if (!s || s.node === 'CLOSED') return;
  const before = s.turns.length;
  s.say(text, intent);
  if (gloss) state.glosses.set(before, gloss);
  if (s.node === 'CLOSED') {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  renderCall();
  renderQueue();
  renderPhone();
  speakNew(before);
}

function speakNew(fromIndex) {
  const turns = state.session.turns.slice(fromIndex).filter((t) => t.speaker === 'agent');
  for (const turn of turns) {
    voice.speak(turn.text, turn.locale, {
      enText: turn.en_text,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onEngine: () => renderTopbar(),
    });
  }
}

function renderCall() {
  const s = state.session;
  const transcript = $('transcript');

  if (!s) {
    $('recDot').hidden = true;
    $('localeChip').hidden = true;
    $('callWho').textContent = 'No call in progress';
    $('callSub').textContent = 'Start one from the campaign gate';
    transcript.innerHTML = `
      <div style="margin:auto; text-align:center; max-width:34ch; color:#8fb0aa; font-size:13.5px">
        The conversation appears here, with the English gloss under every Arabic or Urdu line.
      </div>`;
    const startBtn = el('button', 'btn sm', 'Choose someone to call');
    startBtn.addEventListener('click', () => show('campaign'));
    $('replies').innerHTML = '';
    $('replies').appendChild(startBtn);
    // Show the shape of the call even before it starts.
    $('flow').innerHTML = FLOW.map((f, i) =>
      `<div class="fstep"><span class="bullet">${i + 1}</span><div><div class="name">${f.name}</div><div class="what">${f.what}</div></div></div>`).join('');
    $('toolList').innerHTML = CANONICAL_TOOLS.map((t) =>
      `<li class="off"><span>${t}</span><span class="muted tiny">${TOOL_CAPTIONS[t]}</span></li>`).join('');
    $('toolCount').textContent = `0 of ${CANONICAL_TOOLS.length}`;
    $('callBanners').innerHTML = '';
    $('freeText').disabled = true;
    renderVoicePanel();
    renderTopbar();
    return;
  }

  $('callWho').textContent = state.customer.name;
  $('callSub').textContent = `${state.customer.phone} · recorded end to end`;
  const chip = $('localeChip');
  chip.hidden = false;
  chip.textContent = PACKS[s.locale].label;
  $('recDot').hidden = s.node === 'CLOSED';

  transcript.innerHTML = '';
  s.turns.forEach((turn, i) => {
    const rtl = PACKS[turn.locale]?.dir === 'rtl';
    const protectedTurn = turn.speaker === 'agent' && turn.node === 'PROTECTED';
    const bubble = el('div', `bubble ${turn.speaker} ${rtl ? 'rtl' : ''} ${protectedTurn ? 'protected' : ''}`);
    const who = turn.speaker === 'agent' ? 'RIFQ' : state.customer.name.split(' ')[0];
    const gloss = turn.speaker === 'agent' ? turn.en_text : state.glosses.get(i);
    bubble.innerHTML = `
      <span class="tag">${esc(who)}${turn.speaker === 'agent' ? ` &middot; ${esc(turn.node)}` : ''}</span>
      ${esc(turn.text)}
      ${gloss ? `<span class="gloss">${esc(gloss)}</span>` : ''}`;
    transcript.appendChild(bubble);
  });
  transcript.scrollTop = transcript.scrollHeight;

  // workflow rail
  const flow = $('flow');
  flow.innerHTML = '';
  const reached = FLOW.findIndex((f) => f.node === s.node);
  const escalated = Boolean(s.caseRecord);
  FLOW.forEach((f, i) => {
    let cls = 'fstep';
    if (s.node === f.node) cls += ' now';
    else if (reached === -1 ? passedByOutcome(s, i) : i < reached) cls += ' done';
    flow.appendChild(el('div', cls,
      `<span class="bullet">${i + 1}</span><div><div class="name">${f.name}</div><div class="what">${f.what}</div></div>`));
  });
  if (escalated || s.node === 'PROTECTED') {
    flow.appendChild(el('div', 'fstep protected',
      '<span class="bullet">H</span><div><div class="name">Protected branch</div><div class="what">Collection tools removed, contact held, case owned</div></div>'));
  }

  // tools
  const allowed = new Set(POLICY.node_tools[s.node] || []);
  const list = $('toolList');
  list.innerHTML = '';
  for (const tool of CANONICAL_TOOLS) {
    const on = allowed.has(tool);
    const gone = !on && escalated && COLLECTION_TOOLS.has(tool);
    const badge = on ? '<span class="badge">held</span>' : gone ? '<span class="badge">removed</span>' : '';
    list.appendChild(el('li', on ? 'on' : gone ? 'gone' : 'off',
      `<span>${tool}</span><span class="muted tiny">${TOOL_CAPTIONS[tool]}</span>${badge}`));
  }
  $('toolCount').textContent = `${allowed.size} of ${CANONICAL_TOOLS.length}`;

  // banners
  const banners = $('callBanners');
  banners.innerHTML = '';
  if (s.caseRecord) {
    banners.appendChild(el('div', 'banner gold',
      `<b>Case ${esc(s.caseRecord.case_id)} opened</b>${esc(s.caseRecord.owner)} in the ${esc(s.caseRecord.queue)} owns it, within ${s.caseRecord.sla_hours} hours.`));
  }
  if (state.suppression.has(state.customer.id)) {
    banners.appendChild(el('div', 'banner red',
      `<b>Automated contact paused</b>${esc(state.suppression.reasonFor(state.customer.id))}. The agency file export reads the same list.`));
  }
  if (s.outcome && !s.caseRecord) {
    banners.appendChild(el('div', 'banner mint',
      `<b>Outcome: ${esc(s.outcome.outcome.replace(/_/g, ' '))}</b>${s.outcome.reference ? `Reference ${esc(s.outcome.reference)}, and the customer has it in writing.` : 'Nothing was promised that the customer cannot see.'}`));
  }
  const verification = state.gateway.verifications.get(s.verificationSession);
  if (s.verificationSession && !verification?.approved && s.node !== 'CLOSED') {
    banners.appendChild(el('div', 'banner mint',
      '<b>Waiting on the customer app</b>Open the Customer app tab and approve. No PIN or code is ever requested.'));
  }
  $('flagApp').hidden = !(s.verificationSession && !verification?.approved && s.node !== 'CLOSED');

  // replies
  const replies = $('replies');
  replies.innerHTML = '';
  for (const r of s.suggestions()) {
    const danger = ['hardship', 'dispute', 'complaint', 'waiver', 'opt_out'].includes(r.intent);
    const showGloss = r.gloss && r.gloss !== r.text;
    const btn = el('button', `reply ${danger ? 'danger' : ''}`,
      `${esc(r.text)}${showGloss ? `<span class="g">${esc(r.gloss)}</span>` : ''}`);
    btn.addEventListener('click', () => customerSays(r.raw || r.text, r.intent === 'date' ? undefined : r.intent, showGloss ? r.gloss : null));
    replies.appendChild(btn);
  }
  if (s.node === 'CLOSED') {
    const again = el('button', 'btn ghost sm', 'Back to the campaign gate');
    again.addEventListener('click', () => show('campaign'));
    const ev = el('button', 'btn sm', 'See the evidence');
    ev.addEventListener('click', () => show('evidence'));
    replies.append(ev, again);
  }
  $('freeText').disabled = s.node === 'CLOSED';

  renderVoicePanel();
  renderTopbar();
  renderCoach();
}

function passedByOutcome(session, index) {
  // After a call closes the node is CLOSED, so mark the steps it actually passed.
  if (session.node !== 'CLOSED' && session.node !== 'PROTECTED') return false;
  const depth = session.verified ? (session.outcome?.reference ? 5 : 3) : 1;
  return index < depth;
}

$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const value = $('freeText').value.trim();
  if (!value) return;
  $('freeText').value = '';
  customerSays(value);
});

$('voiceToggle').addEventListener('change', (e) => {
  voice.setEnabled(e.target.checked);
  if (!e.target.checked) setSpeaking(false);
  renderVoicePanel();
  renderTopbar();
});

// ---------- voice panel ----------

function renderVoicePanel() {
  const rows = $('voiceRows');
  rows.innerHTML = '';
  for (const r of voiceReport()) {
    const cls = r.engine === 'elevenlabs' ? '' : r.engine === 'browser' ? 'grey' : 'gold';
    rows.appendChild(el('div', 'vrow',
      `<span>${esc(PACKS[r.locale].label)}</span><span class="chip ${cls}">${esc(r.label)}</span>`));
  }
  $('voiceEngineChip').textContent = voice.key ? 'ElevenLabs' : 'browser voices';

  const sample = $('voiceSample');
  sample.innerHTML = '';
  for (const locale of ['en-AE', 'ar-AE', 'ur-AE']) {
    const btn = el('button', 'btn ghost sm', `Hear ${PACKS[locale].short}`);
    btn.addEventListener('click', () => {
      voice.stop();
      voice.speak(PACKS[locale].t.intro, locale, {
        enText: PACKS['en-AE'].t.intro,
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
      });
    });
    sample.appendChild(btn);
  }

  const box = $('voiceConnect');
  box.innerHTML = '';
  if (!voice.key) {
    box.appendChild(el('p', 'small muted', 'Most laptops have no Arabic or Urdu voice, so those lines fall back to the English line from the same approved template. Paste an ElevenLabs key to hear all three properly.'));
    const row = el('div', 'vinput');
    const input = el('input');
    input.type = 'password';
    input.placeholder = 'ElevenLabs API key';
    input.setAttribute('aria-label', 'ElevenLabs API key');
    const btn = el('button', 'btn sm', 'Connect');
    btn.addEventListener('click', async () => {
      if (!input.value.trim()) return;
      btn.textContent = 'Checking';
      btn.disabled = true;
      const res = await voice.connect(input.value.trim());
      if (!res.ok) {
        btn.disabled = false;
        btn.textContent = 'Connect';
        box.appendChild(el('p', 'small', `<span style="color:var(--red)">${esc(res.error)}</span>`));
        return;
      }
      renderVoicePanel();
      renderTopbar();
    });
    row.append(input, btn);
    box.appendChild(row);
  } else {
    const row = el('div', 'vinput');
    const select = el('select');
    select.setAttribute('aria-label', 'ElevenLabs voice');
    for (const v of voice.voices) {
      const opt = el('option', '', esc(v.name));
      opt.value = v.id;
      if (v.id === voice.voiceId) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => voice.setVoiceId(select.value));
    const off = el('button', 'btn ghost sm', 'Disconnect');
    off.addEventListener('click', () => { voice.disconnect(); renderVoicePanel(); renderTopbar(); });
    row.append(select, off);
    box.appendChild(row);
    box.appendChild(el('p', 'small muted', 'One multilingual model speaks all three approved packs. The key stays in this tab and is never stored on a server.'));
  }
}

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
    outcomeBox.innerHTML = '<div class="label">Written outcome</div><p class="small muted" style="margin-top:8px">Anything agreed on the call appears here in writing, with the same reference the agent read out.</p>';
    return;
  }

  const verification = state.gateway.verifications.get(s.verificationSession);
  if (verification && !verification.approved) {
    const notif = el('div', 'notif');
    notif.innerHTML = `<h4>Identity check</h4>
      <p>Demo Bank asked to confirm it is you on the call. This does not authorise a payment, and no PIN or code is needed.</p>`;
    const row = el('div', 'row');
    const approve = el('button', 'btn sm', 'Approve');
    approve.addEventListener('click', () => {
      state.gateway.approveVerification(s.verificationSession);
      renderPhone();
      renderCall();
      renderCoach();
    });
    const reject = el('button', 'btn ghost sm', 'Not me');
    reject.addEventListener('click', () => { show('call'); customerSays('you have the wrong number', 'wrong_party'); });
    row.append(approve, reject);
    notif.appendChild(row);
    screen.appendChild(notif);
  } else if (verification?.approved && !s.caseRecord && !s.outcome) {
    screen.appendChild(el('div', 'notif', '<h4>Identity confirmed</h4><p style="margin:0">You approved the request at ' + String(state.hour).padStart(2, '0') + ':00. Nothing was paid or authorised.</p>'));
  }

  if (s.caseRecord) {
    const c = s.caseRecord;
    const card = el('div', 'notif gold');
    card.innerHTML = `<h4>Case ${esc(c.case_id)}</h4><p>${esc(c.queue)}</p>`;
    card.appendChild(el('ul', 'timeline', `
      <li><span class="dot"></span><div><strong>You explained your situation once</strong><br /><span class="muted">"${esc(c.customer_words.slice(0, 64))}"</span></div></li>
      <li><span class="dot"></span><div><strong>Collection calls paused</strong><br /><span class="muted">Bank dialer and agency file</span></div></li>
      <li><span class="dot gold"></span><div><strong>${esc(c.owner)} owns this case</strong><br /><span class="muted">Will contact you within ${c.sla_hours} hours</span></div></li>`));
    screen.appendChild(card);
  }

  if (s.outcome?.reference && !s.caseRecord) {
    screen.appendChild(el('div', 'notif',
      `<h4>${esc(s.outcome.outcome.replace(/_/g, ' '))}</h4><p style="margin:0">Reference ${esc(s.outcome.reference)}. Confirmed in writing, nothing was taken from your account.</p>`));
  }

  if (!verification && !s.caseRecord && !s.outcome) {
    screen.appendChild(el('div', 'empty', 'The call has not reached verification yet.'));
  }

  outcomeBox.innerHTML = s.outcome
    ? `<div class="label">Written outcome</div>
       <p class="small" style="margin-top:8px"><strong>${esc(s.outcome.outcome.replace(/_/g, ' '))}</strong>${s.outcome.reference ? ` &middot; ${esc(s.outcome.reference)}` : ''}</p>
       <p class="small muted" style="margin:6px 0 0">Nothing was agreed verbally that the customer cannot see in writing.</p>`
    : '<div class="label">Written outcome</div><p class="small muted" style="margin-top:8px">Anything agreed on the call appears here in writing, with the same reference the agent read out.</p>';
}

// ---------- evidence ----------

function renderEvidence() {
  const list = $('turnList');
  const table = $('toolTable');
  const counts = $('evidenceCounts');
  list.innerHTML = '';
  counts.innerHTML = '';

  if (!state.session) {
    list.innerHTML = '<li class="small muted">No call yet. Place one from the campaign gate and the receipts appear here.</li>';
    table.innerHTML = '<tr><td colspan="4" class="muted">No actions yet.</td></tr>';
    $('receiptPane').textContent = 'Select a line on the left.';
    return;
  }

  const spoken = state.session.turns.filter((t) => t.speaker === 'agent').length;
  const actions = state.gateway.receipts.filter((r) => r.ok).length;
  const refusals = state.gateway.receipts.filter((r) => !r.ok).length;
  counts.append(
    el('span', 'chip mono', `${spoken} sentences`),
    el('span', 'chip mono grey', `${actions} actions`),
    el('span', `chip mono ${refusals ? 'red' : 'grey'}`, `${refusals} refused`),
  );

  state.session.turns.forEach((turn, i) => {
    const li = el('li');
    const btn = el('button', `${state.selectedTurn === i ? 'sel' : ''} ${turn.speaker === 'customer' ? 'cust' : ''}`);
    btn.innerHTML = `
      <span class="who"><span>${turn.speaker === 'agent' ? 'RIFQ' : 'Customer'}</span><span>${turn.receipt ? esc(turn.receipt.template_id) : 'free speech'}</span></span>
      <span class="txt" dir="auto">${esc(turn.text)}</span>`;
    btn.addEventListener('click', () => { state.selectedTurn = i; renderEvidence(); renderCoach(); });
    li.appendChild(btn);
    list.appendChild(li);
  });

  const turn = state.session.turns[state.selectedTurn];
  const pane = $('receiptPane');
  pane.className = 'receipt';
  if (!turn) {
    pane.className = 'small muted';
    pane.textContent = 'Select a line on the left.';
  } else if (!turn.receipt) {
    pane.className = 'small muted';
    pane.innerHTML = 'This is what the customer said. It is kept in the transcript and carried into the case, but it holds no policy authority of its own.';
  } else {
    const r = turn.receipt;
    pane.innerHTML = [
      ['Spoken', r.text, 'said'],
      ['Template', r.template_id],
      ['Language', r.locale],
      ['Node', r.workflow_node],
      ['Policy', `${r.policy_id} v${r.policy_version}`],
      ['Approved by', r.approver],
      ['Hash', r.approval_hash],
      ['Turn', r.turn_id],
      ...(Object.keys(r.variables || {}).length ? [['Variables', JSON.stringify(r.variables)]] : []),
    ].map(([k, v, cls]) => `<div class="line"><span class="k">${esc(k)}</span><span class="v ${cls || ''}" dir="auto">${esc(v)}</span></div>`).join('');
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

function summarise(result) {
  if (!result || typeof result !== 'object') return String(result ?? '');
  if (result.case_id) return `${result.case_id} to ${result.owner}, ${result.sla_hours}h SLA`;
  if (result.reference) return `reference ${result.reference}`;
  if (result.amount_due) return `${result.currency} ${result.amount_due.toFixed(2)} due ${formatDate(result.due_date)}`;
  if (result.dates) return result.dates.map(formatDate).join(', ');
  if (result.session_id) return 'app push sent, no secret requested';
  if (result.hold) return `hold applied for ${result.reason}, read by the bank and agency dialers`;
  if (result.verified !== undefined) return `verified: ${result.verified}`;
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
  $('passCount').textContent = `${TEST_RESULTS.totals.passed} of ${TEST_RESULTS.totals.runs} runs passed`;
  $('testMeta').innerHTML = `${esc(TEST_RESULTS.policy)} &middot; ${TEST_RESULTS.runs_per_scenario} runs per scenario &middot; generated ${esc(TEST_RESULTS.generated_at.slice(0, 10))} &middot; <span class="mono">npm test</span>`;

  const bars = $('langBars');
  bars.innerHTML = '';
  for (const [lang, v] of Object.entries(TEST_RESULTS.by_language)) {
    bars.appendChild(el('div', 'langrow',
      `<div class="spread small"><span>${esc(lang)}</span><span class="mono">${v.pass_rate}%</span></div><div class="bar"><span style="width:${v.pass_rate}%"></span></div>`));
  }

  $('testTable').innerHTML = [
    ...TEST_RESULTS.scenarios.map((s) => `<tr>
      <td class="mono">${esc(s.id)}</td><td>${esc(s.name)}</td><td class="mono">${esc(s.locale)}</td>
      <td class="${s.passed === s.runs ? 'ok' : 'no'}">${s.passed}/${s.runs}</td></tr>`),
    ...TEST_RESULTS.gate.map((g) => `<tr>
      <td class="mono">${esc(g.id)}</td><td>${esc(g.name)}</td><td class="mono">gate</td>
      <td class="${g.passed ? 'ok' : 'no'}">${g.passed ? 'pass' : 'fail'}</td></tr>`),
  ].join('');
}

// ---------- boot ----------

function renderAll() {
  renderClock();
  renderQueue();
  renderAgencyLog();
  renderCall();
  renderPhone();
  renderEvidence();
  renderTests();
  renderTopbar();
  renderCoach();
}

primeVoices();
setSpeaking(false);
// Browser voices arrive asynchronously; refresh the panel once they do.
if ('speechSynthesis' in window) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    renderVoicePanel();
    renderTopbar();
  });
}
voice.restore().then(() => { renderVoicePanel(); renderTopbar(); });
renderAll();
