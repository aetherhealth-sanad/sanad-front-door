#!/usr/bin/env node
/**
 * Full-stack live system verification script (`node --test`).
 * Drives the running Vite web server (http://127.0.0.1:3000) and FastAPI server (http://127.0.0.1:8000)
 * through the exact Patient, Mock Reviewer, and Mock Facility flows defined in apps/web/src/api/client.ts.
 *
 * Notice: Research prototype verification on synthetic data only. Not evidence of clinical validity.
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const TEMP_DB = path.join(REPO_ROOT, 'apps/api/sanad-e2e-live.db');

const WEB_ORIGIN = process.env.SANAD_WEB_ORIGIN || 'http://127.0.0.1:3000';
const API_ORIGIN = process.env.SANAD_API_ORIGIN || 'http://127.0.0.1:8000';

let apiProc = null;
let webProc = null;

async function waitForUrl(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

before(async () => {
  try {
    const res = await fetch(`${WEB_ORIGIN}/`);
    const apiRes = await fetch(`${API_ORIGIN}/version`);
    if (res.ok && apiRes.ok) {
      return; // servers already running
    }
  } catch {
    // spawn servers below
  }

  rmSync(TEMP_DB, { force: true });
  apiProc = spawn(
    path.join(REPO_ROOT, 'apps/api/.venv/bin/uvicorn'),
    ['sanad_api.main:create_app', '--factory', '--app-dir', path.join(REPO_ROOT, 'apps/api'), '--host', '127.0.0.1', '--port', '8000'],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        SANAD_DATABASE_URL: `sqlite:///${TEMP_DB}`,
        SANAD_DEMO_REVIEWER_PASSWORD: 'test-only-reviewer',
        SANAD_DEMO_MOCK_FACILITY_PASSWORD: 'test-only-facility',
      },
      stdio: 'ignore',
    },
  );

  webProc = spawn(
    'npm',
    ['--prefix', path.join(REPO_ROOT, 'apps/web'), 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '3000'],
    {
      cwd: REPO_ROOT,
      env: { ...process.env },
      stdio: 'ignore',
    },
  );

  await waitForUrl(`${API_ORIGIN}/version`);
  await waitForUrl(`${WEB_ORIGIN}/`);
});

after(() => {
  if (webProc) {
    webProc.kill('SIGTERM');
  }
  if (apiProc) {
    apiProc.kill('SIGTERM');
  }
  rmSync(TEMP_DB, { force: true });
});

// Simulated browser sessionStorage per tab/role
const storage = {
  patientToken: null,
  staffToken: null,
};

async function webCall(path, options = {}, role = 'none') {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (role === 'patient' && storage.patientToken) {
    headers.set('Authorization', `Bearer ${storage.patientToken}`);
  } else if (role === 'staff' && storage.staffToken) {
    headers.set('Authorization', `Bearer ${storage.staffToken}`);
  }
  const res = await fetch(`${WEB_ORIGIN}${path}`, { ...options, headers });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, text, json };
}

test('Live Full-Stack E2E Flow via Vite Web Server (http://127.0.0.1:3000) -> FastAPI (http://127.0.0.1:8000)', async (t) => {
  await t.test('Step 1: Static Web Assets, Service Worker & Emergency Page Reachability (TC-05.1, TC-05.4, TC-10.1)', async () => {
    const indexRes = await webCall('/');
    assert.equal(indexRes.status, 200);
    assert.match(indexRes.text, /<div id="root"><\/div>/);

    const urgentRes = await webCall('/urgent.html');
    assert.equal(urgentRes.status, 200);
    assert.match(urgentRes.text, /Mock emergency page · CLINICAL_TBD/);
    assert.match(urgentRes.text, /998/);
    assert.match(urgentRes.text, /999/);
    assert.match(urgentRes.text, /Sanad is a research prototype, not a certified medical device/);
    assert.doesNotMatch(urgentRes.text, /https?:\/\//);

    const swRes = await webCall('/sw.js');
    assert.equal(swRes.status, 200);
    assert.match(swRes.text, /\/urgent\.html/);
    assert.match(swRes.text, /url\.pathname\.startsWith\('\/api\/'\)/);

    const verRes = await fetch(`${API_ORIGIN}/version`);
    assert.equal(verRes.status, 200);
    assert.equal(verRes.headers.get('cache-control'), 'no-store');
  });

  let caseId = '';
  let caseVersion = 1;

  await t.test('Step 2: Patient Start Screen & Sample Discovery via Vite /api Proxy (TC-02.1, TC-02.2)', async () => {
    const samplesRes = await webCall('/api/samples');
    assert.equal(samplesRes.status, 200);
    assert.equal(samplesRes.headers.get('cache-control'), 'no-store');
    const sampleIds = samplesRes.json.samples.map((s) => s.fixture_id);
    assert.ok(sampleIds.includes('J1-002'));
    assert.ok(sampleIds.every((id) => !id.startsWith('CN-')));

    const createRes = await webCall('/api/cases', {
      method: 'POST',
      body: JSON.stringify({ start_mode: 'SAMPLE', fixture_id: 'J1-002', preferred_language: 'en' }),
    });
    assert.equal(createRes.status, 201);
    caseId = createRes.json.case_id;
    storage.patientToken = createRes.json.session_token;
    assert.match(caseId, /^SANAD-[0-9a-f]{12}$/);
    assert.equal(createRes.json.state.state, 'DRAFT');
    assert.equal(createRes.json.state.route, '/consent');
  });

  await t.test('Step 3: Consent Ledger & Sample Profile Application (TC-03.1..03.4)', async () => {
    const consentCat = await webCall('/api/consent/current');
    assert.equal(consentCat.status, 200);
    assert.equal(consentCat.json.consent_version, 'CONSENT-0.1');
    assert.equal(consentCat.json.scopes.length, 5);

    const grantRes = await webCall(
      `/api/cases/${caseId}/consent`,
      {
        method: 'PUT',
        body: JSON.stringify({
          consent_version: 'CONSENT-0.1',
          decisions: { assessment: true, clinician_review: true, provider_share: true },
        }),
      },
      'patient',
    );
    assert.equal(grantRes.status, 200);
    assert.equal(grantRes.json.state.state, 'CONSENTED');
    assert.equal(grantRes.json.scopes.spouse_share.granted, false);
    assert.equal(grantRes.json.scopes.research_use.granted, false);

    const loadSampleRes = await webCall(`/api/cases/${caseId}/profile/sample`, { method: 'POST' }, 'patient');
    assert.equal(loadSampleRes.status, 200);
    assert.equal(loadSampleRes.json.state, 'CONSENTED');
  });

  await t.test('Step 4: Deterministic Safety Check (TC-10.2..10.4)', async () => {
    const safetyRes = await webCall(
      `/api/cases/${caseId}/safety-check`,
      {
        method: 'POST',
        body: JSON.stringify({
          catalogue_version: 'emergency-draft-0.1',
          answers: [
            { question_id: 'SAFETY-01', response: 'NO' },
            { question_id: 'SAFETY-02', response: 'NO' },
            { question_id: 'SAFETY-03', response: 'NO' },
          ],
        }),
      },
      'patient',
    );
    assert.equal(safetyRes.status, 200);
    assert.equal(safetyRes.json.result, 'SAFE_TO_CONTINUE');
    assert.equal(safetyRes.json.state.state, 'ASSESSING');
    assert.equal(safetyRes.json.state.route, '/intake');
  });

  await t.test('Step 5: Structured Follow-Up Intake, Optional Psychosocial Context & J3 Lab Confirmation (TC-06.2, TC-15.1, TC-18.1..18.3)', async () => {
    const qRes = await webCall(`/api/cases/${caseId}/questions`, {}, 'patient');
    assert.equal(qRes.status, 200);
    assert.ok(qRes.json.questions.some((q) => q.question_id === 'Q-BODY-FAT'));

    // Answer Q-BODY-FAT as NOT_SURE (stored as UNKNOWN)
    const ansRes = await webCall(
      `/api/cases/${caseId}/answers`,
      {
        method: 'POST',
        body: JSON.stringify({
          answers: [{ question_id: 'Q-BODY-FAT', choice: 'NOT_SURE' }],
        }),
      },
      'patient',
    );
    assert.equal(ansRes.status, 200);

    // Submit optional psychosocial self-report (PATIENT_REPORTED, UNVERIFIED, CONTEXT_ONLY_NOT_TRIAGE)
    const psyRes = await webCall(
      `/api/cases/${caseId}/psychosocial`,
      {
        method: 'PUT',
        body: JSON.stringify({
          answers: [
            { question_id: 'PSY-STRESS-01', response_state: 'KNOWN_POSITIVE', response_code: 'YES' },
          ],
        }),
      },
      'patient',
    );
    assert.equal(psyRes.status, 200);
    assert.equal(psyRes.json.diagnostic_label, null);

    // Add and confirm a J3 lab observation
    const obsRes = await webCall(
      `/api/cases/${caseId}/observations`,
      {
        method: 'POST',
        body: JSON.stringify({
          test_code: 'MOTILITY_PLACEHOLDER',
          value: 40,
          unit: '%',
          collected_on: '2026-10-20',
          reference_source: 'Synthetic report',
        }),
      },
      'patient',
    );
    assert.equal(obsRes.status, 201);
    assert.equal(obsRes.json.confirmation_status, 'NEEDS_USER_CONFIRMATION');

    const confRes = await webCall(
      `/api/cases/${caseId}/observations/${obsRes.json.observation_id}/confirm`,
      { method: 'POST' },
      'patient',
    );
    assert.equal(confRes.status, 200);
    assert.equal(confRes.json.confirmation_status, 'CONFIRMED_BY_USER');

    // Run assessment
    const assessRes = await webCall(
      `/api/cases/${caseId}/assess`,
      { method: 'POST', body: JSON.stringify({ entry_path: 'FULL_INTAKE' }) },
      'patient',
    );
    assert.equal(assessRes.status, 200);
    assert.equal(assessRes.json.draft_ready, true);
    assert.equal(assessRes.json.triage_proposal.action, 'SPECIALIST');
    assert.equal(assessRes.json.triage_proposal.floor, 'SPECIALIST');
    caseVersion = assessRes.json.state.case_version;
  });

  await t.test('Step 6: Patient Report Verification (Withheld Next Step) & Request Mock Review (TC-07.4, AC-08.9)', async () => {
    const repBefore = await webCall(`/api/cases/${caseId}/report`, {}, 'patient');
    assert.equal(repBefore.status, 200);
    assert.equal(repBefore.json.is_mock, true);
    assert.equal(repBefore.json.screening_notice, 'Screening, not diagnosis');
    assert.equal(repBefore.json.next_step, null);
    assert.equal(repBefore.json.next_step_withheld, 'PENDING_REVIEW');
    assert.equal(repBefore.json.psychosocial_context_use, 'CONTEXT_ONLY_NOT_TRIAGE');
    assert.ok(repBefore.json.unknown.some((u) => u.concept_code === 'body_fat_percent' && u.state === 'UNKNOWN'));

    const reqRev = await webCall(
      `/api/cases/${caseId}/review-requests`,
      { method: 'POST', body: JSON.stringify({ case_version: caseVersion }) },
      'patient',
    );
    assert.equal(reqRev.status, 201);
    assert.equal(reqRev.json.state.state, 'PENDING_CLINICIAN_REVIEW');
    assert.equal(reqRev.json.state.route, '/tracking');
  });

  await t.test('Step 7: Mock Reviewer Portal Login, Queue Inspection & Simulated Approval (TC-08.1..08.7)', async () => {
    const loginRes = await webCall('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'demo-reviewer', password: 'test-only-reviewer' }),
    });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.json.role, 'REVIEWER');
    storage.staffToken = loginRes.json.token;

    const queueRes = await webCall('/api/reviews/queue', {}, 'staff');
    assert.equal(queueRes.status, 200);
    assert.equal(queueRes.json.review_mode, 'SIMULATED');
    assert.ok(queueRes.json.items.some((item) => item.case_id === caseId));

    const detailRes = await webCall(`/api/reviews/${caseId}`, {}, 'staff');
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.json.is_mock, true);

    // Negative check: editing below the SPECIALIST floor is rejected with 422 TRIAGE_BELOW_FLOOR
    const belowFloor = await webCall(
      `/api/reviews/${caseId}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({
          decision: 'EDIT',
          case_version: caseVersion,
          edits: { triage_action: 'PRIMARY_CARE' },
        }),
      },
      'staff',
    );
    assert.equal(belowFloor.status, 422);
    assert.equal(belowFloor.json.error.code, 'TRIAGE_BELOW_FLOOR');

    // Approve the case
    const approveRes = await webCall(
      `/api/reviews/${caseId}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({
          decision: 'APPROVE',
          case_version: caseVersion,
          note: 'Simulated approval for synthetic E2E test.',
        }),
      },
      'staff',
    );
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.json.kind, 'SIMULATED_APPROVAL');
    assert.equal(approveRes.json.state, 'GUIDANCE_AVAILABLE');
  });

  let referralId = '';

  await t.test('Step 8: Released Patient Guidance, Closed-Loop Navigation (J9/J10) & Referral Gate (TC-12.1, TC-19.1..19.6)', async () => {
    const repAfter = await webCall(`/api/cases/${caseId}/report`, {}, 'patient');
    assert.equal(repAfter.status, 200);
    assert.equal(repAfter.json.review_status, 'SIMULATED_APPROVAL');
    assert.equal(repAfter.json.next_step.action, 'SPECIALIST');
    assert.equal(repAfter.json.next_step.is_mock, true);
    const { guidance_id, guidance_version } = repAfter.json;
    assert.ok(guidance_id && guidance_version);

    // Start navigation
    const startNav = await webCall(`/api/cases/${caseId}/navigation/start`, { method: 'POST' }, 'patient');
    assert.equal(startNav.status, 200);
    assert.equal(startNav.json.state, 'NAVIGATION_STARTED');

    // Acknowledge guidance
    const ackRes = await webCall(
      `/api/cases/${caseId}/navigation/acknowledgements`,
      {
        method: 'POST',
        body: JSON.stringify({ guidance_id, guidance_version }),
      },
      'patient',
    );
    assert.equal(ackRes.status, 200);
    assert.equal(ackRes.json.acknowledged, true);

    // Record idempotent self-reported progress & barrier
    const progRes = await webCall(
      `/api/cases/${caseId}/navigation/progress`,
      {
        method: 'POST',
        body: JSON.stringify({ status: 'BOOKING_SELF_REPORTED', idempotency_key: 'live-e2e-prog-1' }),
      },
      'patient',
    );
    assert.equal(progRes.status, 200);

    const barRes = await webCall(
      `/api/cases/${caseId}/navigation/barriers`,
      {
        method: 'POST',
        body: JSON.stringify({
          barrier_reasons: ['COST_CONCERN'],
          prefer_not_to_say: false,
          free_text_opt_in: false,
          idempotency_key: 'live-e2e-bar-1',
        }),
      },
      'patient',
    );
    assert.equal(barRes.status, 200);

    // Check reviewer navigation funnel
    const funnelRes = await webCall('/api/evaluation/navigation-funnel', {}, 'staff');
    assert.equal(funnelRes.status, 200);
    assert.equal(funnelRes.json.provider_verified_visits, 'NOT_AVAILABLE');
    assert.equal(funnelRes.json.care_completed, 'NOT_AVAILABLE');
    assert.ok(funnelRes.json.guidance_episodes >= 1);

    // Preview Referral Gate -> ALLOW
    const gatePreview = await webCall(
      `/api/cases/${caseId}/referral-gate?target_mock_facility_id=MOCK-CLINIC-A`,
      {},
      'patient',
    );
    assert.equal(gatePreview.status, 200);
    assert.equal(gatePreview.json.decision, 'ALLOW');

    // Send Mock Referral
    const refRes = await webCall(
      `/api/cases/${caseId}/mock-referral`,
      {
        method: 'POST',
        body: JSON.stringify({ target_mock_facility_id: 'MOCK-CLINIC-A' }),
      },
      'patient',
    );
    assert.equal(refRes.status, 201);
    assert.equal(refRes.json.gate_decision.decision, 'ALLOW');
    assert.equal(refRes.json.referral.mock_status, 'MOCK_SENT');
    referralId = refRes.json.referral.referral_id;
  });

  await t.test('Step 9: Mock Facility Portal Login, Snapshot Privacy & Lifecycle Progression (TC-13.1..13.6)', async () => {
    const facLogin = await webCall('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'demo-mock-facility', password: 'test-only-facility' }),
    });
    assert.equal(facLogin.status, 200);
    assert.equal(facLogin.json.role, 'MOCK_FACILITY');
    storage.staffToken = facLogin.json.token;

    const facDetail = await webCall(`/api/mock-facility/referrals/${referralId}`, {}, 'staff');
    assert.equal(facDetail.status, 200);
    assert.equal(facDetail.json.is_mock, true);
    assert.ok(facDetail.json.snapshot.case_code.startsWith('C-'));
    // Snapshot never leaks the internal case_id
    assert.ok(!JSON.stringify(facDetail.json).includes(caseId));

    for (const status of ['MOCK_RECEIVED', 'MOCK_ACCEPTED']) {
      const ev = await webCall(
        `/api/mock-facility/referrals/${referralId}/events`,
        { method: 'POST', body: JSON.stringify({ mock_status: status }) },
        'staff',
      );
      assert.equal(ev.status, 201);
    }

    const schedEv = await webCall(
      `/api/mock-facility/referrals/${referralId}/events`,
      {
        method: 'POST',
        body: JSON.stringify({
          mock_status: 'MOCK_APPOINTMENT_SCHEDULED',
          mock_appointment: { starts_at: '2026-11-20T10:00:00Z' },
        }),
      },
      'staff',
    );
    assert.equal(schedEv.status, 201);
    assert.equal(schedEv.json.mock_appointment.label, 'Mock appointment, not a real booking');

    const closeEv = await webCall(
      `/api/mock-facility/referrals/${referralId}/events`,
      { method: 'POST', body: JSON.stringify({ mock_status: 'MOCK_CLOSED' }) },
      'staff',
    );
    assert.equal(closeEv.status, 201);
  });

  await t.test('Step 10: Patient Tracking Timeline & Quick Exit Session Invalidation (TC-14.1, TC-09.5, TC-19.4)', async () => {
    const trackRes = await webCall(`/api/cases/${caseId}/tracking`, {}, 'patient');
    assert.equal(trackRes.status, 200);
    assert.equal(trackRes.json.case_state, 'CLOSED');
    assert.equal(trackRes.json.referral.mock_status, 'MOCK_CLOSED');
    assert.ok(trackRes.json.timeline.length >= 6);

    // Quick Exit beacon call via /api/session/end
    const exitRes = await webCall('/api/session/end', {
      method: 'POST',
      body: JSON.stringify({ session_token: storage.patientToken }),
    });
    assert.equal(exitRes.status, 204);

    // Old patient token is immediately invalidated (401 AUTH_REQUIRED)
    const afterExit = await webCall(`/api/cases/${caseId}/state`, {}, 'patient');
    assert.equal(afterExit.status, 401);
    assert.equal(afterExit.json.error.code, 'AUTH_REQUIRED');
  });
});
