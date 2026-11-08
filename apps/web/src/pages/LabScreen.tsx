import { useEffect, useState } from 'react';
import { api, type ObservationRecord } from '../api/client';
import { MockBadge } from '../components/MockBadge';
import labCatalogue from '../../../../catalogue/lab-tests.draft-0.1.json';

interface LabScreenProps {
  caseId: string;
  onContinueToIntake: () => void;
  onAssessmentComplete: (route: string) => void;
}

const TEST_ENTRIES = Object.entries(labCatalogue.tests) as Array<
  [string, { label: string; accepted_units: string[]; maximum?: number }]
>;

export const LabScreen: React.FC<LabScreenProps> = ({
  caseId,
  onContinueToIntake,
  onAssessmentComplete,
}) => {
  const [observations, setObservations] = useState<ObservationRecord[]>([]);
  const [testCode, setTestCode] = useState<string>(TEST_ENTRIES[0]?.[0] ?? 'VOLUME_PLACEHOLDER');
  const [valueStr, setValueStr] = useState<string>('');
  const [unit, setUnit] = useState<string>(TEST_ENTRIES[0]?.[1]?.accepted_units[0] ?? 'mL');
  const [collectedOn, setCollectedOn] = useState<string>('');
  const [referenceSource, setReferenceSource] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadObservations = async () => {
    setError(null);
    try {
      const res = await api.getObservations(caseId);
      setObservations(res.observations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load lab observations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    api
      .getObservations(caseId)
      .then(res => {
        if (mounted) setObservations(res.observations);
      })
      .catch(err => {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Could not load lab observations.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [caseId]);

  const handleSelectTestCode = (nextCode: string) => {
    setTestCode(nextCode);
    const meta = (labCatalogue.tests as Record<string, { accepted_units: string[] }>)[nextCode];
    if (meta?.accepted_units?.[0]) {
      setUnit(meta.accepted_units[0]);
    }
  };

  const handleSaveObservation = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const parsedValue = valueStr.trim() === '' ? null : Number(valueStr);
      if (parsedValue !== null && !Number.isFinite(parsedValue)) {
        throw new Error('Enter a valid numeric value or leave blank.');
      }
      const payload = {
        test_code: testCode,
        value: parsedValue,
        unit: unit.trim() || null,
        collected_on: collectedOn.trim() || null,
        reference_source: referenceSource.trim() || null,
      };
      if (editingId) {
        await api.replaceObservation(caseId, editingId, payload);
        setNotice('Synthetic observation updated. Confirm it when ready.');
        setEditingId(null);
      } else {
        await api.createObservation(caseId, payload);
        setNotice('Synthetic observation recorded at NEEDS_USER_CONFIRMATION.');
      }
      setValueStr('');
      await loadObservations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Observation could not be saved.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (obs: ObservationRecord) => {
    setEditingId(obs.observation_id);
    setTestCode(obs.test_code);
    setValueStr(obs.value === null ? '' : String(obs.value));
    setUnit(obs.unit ?? '');
    setCollectedOn(obs.collected_on ?? '');
    setReferenceSource(obs.reference_source ?? 'Synthetic report');
    setError(null);
    setNotice(null);
  };

  const handleConfirm = async (obsId: string) => {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await api.confirmObservation(caseId, obsId);
      setNotice('Observation confirmed for use in the draft assessment.');
      await loadObservations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Observation could not be confirmed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (obsId: string) => {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await api.deleteObservation(caseId, obsId);
      if (editingId === obsId) setEditingId(null);
      setNotice('Observation removed from this case.');
      await loadObservations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Observation could not be removed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssessLabPath = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const outcome = await api.assessCase(caseId, 'LAB_ONLY');
      sessionStorage.setItem('sanad_case_entry_path', 'LAB_ONLY');
      sessionStorage.setItem('sanad_visited_lab', 'true');
      onAssessmentComplete(outcome.state.route);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lab entry assessment could not be completed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-8 pb-5 border-b border-[#0B1310] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <MockBadge label={`MOCK LAB OBSERVATIONS · ${labCatalogue.approval_status}`} />
            <span className="font-mono text-xs text-[#3F4E48]">
              {labCatalogue.catalogue_version}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] tracking-tight">
            Synthetic Semen Analysis Observations (J3)
          </h1>
          <p className="text-sm text-[#3F4E48] mt-1.5 max-w-2xl leading-relaxed">
            {labCatalogue.status_note}
          </p>
        </div>
        <button
          type="button"
          onClick={onContinueToIntake}
          className="px-4 py-2.5 rounded-[2px] font-mono font-bold text-xs text-[#0B1310] bg-white hover:bg-[#E6EAE4] border border-[#0B1310] btn-press cursor-pointer whitespace-nowrap"
        >
          Continue to Context Questions →
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-[2px] bg-[#FEF2F2] border border-[#B91C1C] text-[#7F1D1D] text-sm"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="mb-6 p-4 rounded-[2px] bg-[#E6F2EE] border border-[#0F523E] text-[#0F523E] text-sm font-medium"
        >
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 5 Cols: Add / Replace Observation Form */}
        <form
          onSubmit={handleSaveObservation}
          className="lg:col-span-5 dossier-card bg-white p-5 sm:p-6 space-y-4"
        >
          <div className="pb-3 border-b border-[#0B1310] flex items-center justify-between">
            <h2 className="text-base font-extrabold text-[#0B1310]">
              {editingId ? 'Edit Synthetic Observation' : 'Enter Synthetic Observation'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setValueStr('');
                }}
                className="text-xs font-mono underline text-[#C84B31] cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="lab-test-code"
              className="block text-xs font-mono font-bold text-[#0B1310]"
            >
              Placeholder Test Code
            </label>
            <select
              id="lab-test-code"
              value={testCode}
              onChange={e => handleSelectTestCode(e.target.value)}
              className="w-full px-3 py-2 rounded-[2px] border border-[#0B1310] bg-white text-sm font-medium"
            >
              {TEST_ENTRIES.map(([code, meta]) => (
                <option key={code} value={code}>
                  {meta.label} ({code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="lab-value"
                className="block text-xs font-mono font-bold text-[#0B1310]"
              >
                Numeric Value
              </label>
              <input
                id="lab-value"
                type="number"
                step="any"
                value={valueStr}
                onChange={e => setValueStr(e.target.value)}
                placeholder="e.g. 12.5"
                className="w-full px-3 py-2 rounded-[2px] border border-[#0B1310] bg-white text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="lab-unit"
                className="block text-xs font-mono font-bold text-[#0B1310]"
              >
                Unit (No Conversion)
              </label>
              <input
                id="lab-unit"
                type="text"
                value={unit}
                onChange={e => setUnit(e.target.value)}
                placeholder="mL, million/mL, %"
                className="w-full px-3 py-2 rounded-[2px] border border-[#0B1310] bg-white text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="lab-date"
                className="block text-xs font-mono font-bold text-[#0B1310]"
              >
                Collection Date
              </label>
              <input
                id="lab-date"
                type="date"
                value={collectedOn}
                onChange={e => setCollectedOn(e.target.value)}
                className="w-full px-3 py-2 rounded-[2px] border border-[#0B1310] bg-white text-sm font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="lab-ref"
                className="block text-xs font-mono font-bold text-[#0B1310]"
              >
                Reference Source
              </label>
              <select
                id="lab-ref"
                value={referenceSource}
                onChange={e => setReferenceSource(e.target.value)}
                className="w-full px-3 py-2 rounded-[2px] border border-[#0B1310] bg-white text-sm"
              >
                <option value="">Choose reference source...</option>
                {labCatalogue.reference_sources.map(src => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 rounded-[2px] font-mono font-bold text-xs text-white bg-[#0F523E] hover:bg-[#093B2C] border border-[#0B1310] btn-press cursor-pointer disabled:opacity-50"
          >
            {submitting
              ? 'Recording...'
              : editingId
              ? 'Update Synthetic Observation'
              : 'Add Synthetic Observation'}
          </button>
        </form>

        {/* Right 7 Cols: Recorded Observations & Confirmation Ledger */}
        <div className="lg:col-span-7 space-y-5">
          <div className="dossier-card bg-white p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#0B1310]">
              <h2 className="text-base font-extrabold text-[#0B1310]">
                Case Observations Ledger ({observations.length})
              </h2>
              <span className="font-mono text-xs text-[#3F4E48]">
                Unconfirmed values are excluded from assessment
              </span>
            </div>

            {loading && (
              <p className="text-sm text-[#3F4E48] font-mono">Loading synthetic observations…</p>
            )}

            {!loading && observations.length === 0 && (
              <div className="p-6 rounded-[2px] bg-[#F3F4F1] border border-[#C5CEC9] text-center">
                <p className="text-sm font-semibold text-[#0B1310]">
                  No lab observations recorded for this case yet.
                </p>
                <p className="text-xs text-[#3F4E48] mt-1">
                  Enter a synthetic observation on the left or proceed directly to the structured intake questions.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {observations.map(obs => {
                const isConfirmed = obs.confirmation_status === 'CONFIRMED_BY_USER';
                const hasIssues = obs.issues.length > 0;
                const label =
                  (labCatalogue.tests as Record<string, { label: string }>)[obs.test_code]?.label ??
                  obs.test_code;

                return (
                  <div
                    key={obs.observation_id}
                    className={`p-4 rounded-[2px] border ${
                      isConfirmed
                        ? 'bg-[#E6F2EE]/50 border-[#0F523E]'
                        : hasIssues
                        ? 'bg-[#FFFBEB] border-[#B45309]'
                        : 'bg-[#F3F4F1] border-[#0B1310]'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-[#0B1310]">
                          {label} · {obs.test_code} · Mock
                        </span>
                        <div className="text-lg font-extrabold text-[#0B1310] mt-0.5 font-mono">
                          {obs.value ?? 'NULL'} {obs.unit ?? '(no unit)'}
                        </div>
                        <span className="block text-xs font-mono text-[#3F4E48] mt-1">
                          Source: {obs.source} · Date: {obs.collected_on ?? 'Missing'} · Ref:{' '}
                          {obs.reference_source ?? 'Missing'}
                        </span>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-[2px] font-mono text-[10px] font-bold border ${
                          isConfirmed
                            ? 'bg-[#0F523E] text-white border-[#0B1310]'
                            : 'bg-white text-[#0B1310] border-[#0B1310]'
                        }`}
                      >
                        {obs.confirmation_status}
                      </span>
                    </div>

                    {hasIssues && (
                      <div className="mt-3 p-2.5 rounded-[2px] bg-white border border-[#B45309] text-xs text-[#78350F] font-mono">
                        <strong>Validation issues preventing confirmation (AC-15.2):</strong>{' '}
                        {obs.issues.join(', ')}
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-[#C5CEC9] flex flex-wrap items-center gap-2">
                      {!isConfirmed && (
                        <button
                          type="button"
                          disabled={submitting || hasIssues}
                          onClick={() => void handleConfirm(obs.observation_id)}
                          className="px-3 py-1.5 rounded-[2px] font-mono font-bold text-xs text-white bg-[#0F523E] hover:bg-[#093B2C] border border-[#0B1310] cursor-pointer disabled:opacity-40"
                        >
                          Confirm Observation
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleEdit(obs)}
                        className="px-3 py-1.5 rounded-[2px] font-mono font-semibold text-xs text-[#0B1310] bg-white hover:bg-[#E6EAE4] border border-[#0B1310] cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleDelete(obs.observation_id)}
                        className="px-3 py-1.5 rounded-[2px] font-mono font-semibold text-xs text-[#B91C1C] bg-white hover:bg-[#FEF2F2] border border-[#B91C1C] cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-[#0B1310] flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={onContinueToIntake}
                className="flex-1 py-3 px-4 rounded-[2px] font-mono font-bold text-xs text-white bg-[#0B1310] hover:bg-[#0F523E] border border-[#0B1310] btn-press cursor-pointer"
              >
                Continue to Context Questions →
              </button>
              <button
                type="button"
                disabled={submitting || observations.length === 0}
                onClick={() => void handleAssessLabPath()}
                className="py-3 px-4 rounded-[2px] font-mono font-bold text-xs text-[#0B1310] bg-[#E6EAE4] hover:bg-[#C5CEC9] border border-[#0B1310] btn-press cursor-pointer disabled:opacity-50"
              >
                Run Lab-Entry Assessment (J3)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
