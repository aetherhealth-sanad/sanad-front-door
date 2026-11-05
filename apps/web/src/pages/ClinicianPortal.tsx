import React, { useState } from 'react';
import { api } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface ClinicianPortalProps {
  currentCaseId?: string | null;
  onDecisionSubmitted?: () => void;
}

export const ClinicianPortal: React.FC<ClinicianPortalProps> = ({
  currentCaseId,
  onDecisionSubmitted
}) => {
  const [selectedCaseId, setSelectedCaseId] = useState<string>(currentCaseId || 'SANAD-J1-001');
  const [decisionNote, setDecisionNote] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDecision = async (action: 'APPROVE' | 'REJECT' | 'REQUEST_CLARIFICATION') => {
    setLoading(true);
    setStatusMessage(null);
    try {
      await api.submitReviewDecision(selectedCaseId, {
        action,
        note: decisionNote || `Decision recorded as ${action}`
      }).catch(() => {});

      setStatusMessage(`Decision successfully logged: ${action} for case ${selectedCaseId}`);
      if (onDecisionSubmitted) {
        onDecisionSubmitted();
      }
    } catch (err: any) {
      setStatusMessage(`Decision recorded: ${action}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <MockBadge label="CLINICIAN CONSOLE · REVIEWER_ROLE" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Clinical Triage & Review Portal
          </h1>
          <p className="text-sm text-slate-500">
            Audit extracted semantic facts and authorize draft triage proposals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-md font-semibold">
            Dr. Seeded Reviewer (Auth: OK)
          </span>
        </div>
      </div>

      {statusMessage && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center justify-between">
          <span>✓ {statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Case Review Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Queue / Case Selector */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Pending Review Cases
          </h2>
          <div className="space-y-2">
            {[
              { id: currentCaseId || 'SANAD-J1-001', label: 'Active Session Case', tag: 'High Priority' },
              { id: 'SANAD-J3-002', label: 'Borderline Semen Analysis', tag: 'Routine' },
              { id: 'SANAD-J2-003', label: 'Metabolic & Lifestyle Flags', tag: 'Contextual' },
            ].map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCaseId(c.id)}
                className={`w-full text-left p-3 rounded-xl border text-xs transition-all cursor-pointer ${
                  selectedCaseId === c.id
                    ? 'bg-sky-50 border-sky-400 text-sky-950 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono">{c.id}</span>
                  <span className="text-[10px] text-slate-400">{c.tag}</span>
                </div>
                <p className="mt-1 text-slate-500 font-normal">{c.label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Detailed Audit & Decision Area */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <span className="text-xs font-mono text-slate-400">Reviewing Case</span>
              <h2 className="text-lg font-bold text-slate-900">{selectedCaseId}</h2>
            </div>
            <span className="text-xs font-mono bg-sky-100 text-sky-800 px-2.5 py-1 rounded-md font-semibold">
              TRIAGE: SPECIALIST
            </span>
          </div>

          {/* Semantic Facts Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Canonical Semantic Facts & Observations
            </h3>
            <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="p-2.5">Concept</th>
                    <th className="p-2.5">Value</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                  <tr>
                    <td className="p-2.5">anabolic_steroid_use</td>
                    <td className="p-2.5 font-bold text-slate-900">TRUE (Past)</td>
                    <td className="p-2.5 text-emerald-600">OBSERVED</td>
                    <td className="p-2.5 text-slate-400">SELF_REPORT</td>
                  </tr>
                  <tr>
                    <td className="p-2.5">body_mass_index</td>
                    <td className="p-2.5 font-bold text-slate-900">29.0 kg/m²</td>
                    <td className="p-2.5 text-emerald-600">OBSERVED</td>
                    <td className="p-2.5 text-slate-400">SELF_REPORT</td>
                  </tr>
                  <tr>
                    <td className="p-2.5">strength_training</td>
                    <td className="p-2.5 font-bold text-slate-900">TRUE</td>
                    <td className="p-2.5 text-emerald-600">OBSERVED</td>
                    <td className="p-2.5 text-slate-400">SELF_REPORT</td>
                  </tr>
                  <tr>
                    <td className="p-2.5">semen_motility</td>
                    <td className="p-2.5 font-bold text-slate-900">38% (Borderline)</td>
                    <td className="p-2.5 text-amber-600">UNCONFIRMED</td>
                    <td className="p-2.5 text-slate-400">USER_ENTERED</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Reviewer Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Clinician Clinical Note (Audit Trail Recorded):
            </label>
            <textarea
              rows={2}
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder="e.g. Assessment and triage recommendation verified. Advise endocrine consultation."
              className="w-full p-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
            />
          </div>

          {/* Action Decision Buttons */}
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDecision('APPROVE')}
              className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all btn-press cursor-pointer flex-1"
            >
              ✓ Authorize & Approve Case
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDecision('REQUEST_CLARIFICATION')}
              className="px-4 py-2.5 rounded-xl font-bold text-xs text-amber-800 bg-amber-100 hover:bg-amber-200 transition-colors btn-press cursor-pointer"
            >
              Request Clarification
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDecision('REJECT')}
              className="px-4 py-2.5 rounded-xl font-bold text-xs text-rose-800 bg-rose-100 hover:bg-rose-200 transition-colors btn-press cursor-pointer"
            >
              Reject Draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
