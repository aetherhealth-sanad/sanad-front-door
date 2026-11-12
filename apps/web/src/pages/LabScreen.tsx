import { useEffect, useState } from 'react';
import { api, type ObservationRecord } from '../api/client';
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
      <div className="mb-6 pb-6 border-b border-[#E2ECF8] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs font-mono font-bold text-[#0066EE] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full border border-[#BCD8FE]">
              LAB OBSERVATIONS
            </span>
            <span className="text-xs text-[#64748B] font-medium">
              {labCatalogue.catalogue_version}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#072254] tracking-tight">
            Semen Analysis Observations
          </h1>
          <p className="text-sm text-[#475467] mt-1.5 max-w-2xl leading-relaxed">
            {labCatalogue.status_note}
          </p>
        </div>
        <button
          type="button"
          onClick={onContinueToIntake}
          className="btn-pill-secondary px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap"
        >
          Continue to Context Questions →
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] text-sm font-semibold"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="p-4 rounded-xl bg-[#EBF3FF] border border-[#BCD8FE] text-[#0050CC] text-sm font-semibold"
        >
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 5 Cols: Add / Replace Observation Form */}
        <form
          onSubmit={handleSaveObservation}
          className="lg:col-span-5 medical-card bg-white p-6 sm:p-7 space-y-4 rounded-2xl border border-[#E2ECF8] shadow-md"
        >
          <div className="relative h-28 rounded-xl overflow-hidden mb-2 border border-[#BCD8FE]">
            <img
              src="/assets/images/medical_lab_3d.jpg"
              alt="Clinical Lab Diagnostics"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#072254]/70 via-transparent to-transparent flex items-end p-3">
              <span className="text-xs font-bold text-white tracking-wide">
                Standard Semen Parameters · WHO Benchmarks
              </span>
            </div>
          </div>

          <div className="pb-3 border-b border-[#E2ECF8] flex items-center justify-between">
            <h2 className="text-base font-bold text-[#0F172A]">
              {editingId ? 'Edit Synthetic Observation' : 'Enter Synthetic Observation'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setValueStr('');
                }}
                className="text-xs font-semibold underline text-[#D92D20] cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="lab-test-code"
              className="block text-xs font-bold text-[#0F172A]"
            >
              Placeholder Test Code
            </label>
            <select
              id="lab-test-code"
              value={testCode}
              onChange={e => handleSelectTestCode(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
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
                className="block text-xs font-bold text-[#0F172A]"
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
                className="w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="lab-unit"
                className="block text-xs font-bold text-[#0F172A]"
              >
                Unit (No Conversion)
              </label>
              <input
                id="lab-unit"
                type="text"
                value={unit}
                onChange={e => setUnit(e.target.value)}
                placeholder="mL, million/mL, %"
                className="w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="lab-date"
                className="block text-xs font-bold text-[#0F172A]"
              >
                Collection Date
              </label>
              <input
                id="lab-date"
                type="date"
                value={collectedOn}
                onChange={e => setCollectedOn(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="lab-ref"
                className="block text-xs font-bold text-[#0F172A]"
              >
                Reference Source
              </label>
              <select
                id="lab-ref"
                value={referenceSource}
                onChange={e => setReferenceSource(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
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
            className="btn-pill-primary w-full py-3.5 px-4 rounded-full font-bold text-xs text-white shadow-md cursor-pointer disabled:opacity-50"
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
          <div className="medical-card bg-white p-6 sm:p-7 space-y-4 rounded-2xl border border-[#E2ECF8] shadow-md">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2ECF8]">
              <h2 className="text-base font-bold text-[#0F172A]">
                Case Observations Ledger ({observations.length})
              </h2>
              <span className="text-xs text-[#64748B]">
                Unconfirmed values excluded
              </span>
            </div>

            {loading && (
              <div className="space-y-3 py-2">
                {[1, 2].map(i => (
                  <div key={i} className="p-4 rounded-2xl border border-[#E2ECF8] bg-white space-y-2.5">
                    <div className="skeleton h-3 w-1/3" />
                    <div className="skeleton h-6 w-1/4" />
                    <div className="skeleton h-2.5 w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {!loading && observations.length === 0 && (
              <div className="p-8 rounded-2xl bg-[#F8FAFC] border border-[#E2ECF8] text-center">
                <p className="text-sm font-bold text-[#0F172A]">
                  No lab observations recorded for this case yet.
                </p>
                <p className="text-xs text-[#64748B] mt-1">
                  Enter a synthetic observation on the left or proceed directly to the structured intake questions.
                </p>
              </div>
            )}

            <div className="space-y-3.5">
              {observations.map(obs => {
                const isConfirmed = obs.confirmation_status === 'CONFIRMED_BY_USER';
                const hasIssues = obs.issues.length > 0;
                const label =
                  (labCatalogue.tests as Record<string, { label: string }>)[obs.test_code]?.label ??
                  obs.test_code;

                return (
                  <div
                    key={obs.observation_id}
                    className={`p-4 sm:p-5 rounded-2xl border transition-[background-color,border-color,box-shadow] duration-160 ease-[var(--ease-out)] ${
                      isConfirmed
                        ? 'bg-[#F2F7FF] border-[#BCD8FE]'
                        : hasIssues
                        ? 'bg-[#FFFAEB] border-[#FEDF89]'
                        : 'bg-[#F8FAFC] border-[#E2ECF8]'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-[#0F172A]">
                          {label} · {obs.test_code} · Mock
                        </span>
                        <div className="text-lg font-extrabold text-[#0066EE] mt-0.5">
                          {obs.value ?? 'NULL'} {obs.unit ?? '(no unit)'}
                        </div>
                        <span className="block text-xs text-[#64748B] mt-1">
                          Source: {obs.source} · Date: {obs.collected_on ?? 'Missing'} · Ref:{' '}
                          {obs.reference_source ?? 'Missing'}
                        </span>
                      </div>

                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                          isConfirmed
                            ? 'bg-[#0066EE] text-white border-[#0066EE]'
                            : 'bg-white text-[#64748B] border-[#CBD5E1]'
                        }`}
                      >
                        {obs.confirmation_status}
                      </span>
                    </div>

                    {hasIssues && (
                      <div className="mt-3 p-3 rounded-xl bg-white border border-[#FEDF89] text-xs text-[#B54708]">
                        <strong>Validation issues preventing confirmation (AC-15.2):</strong>{' '}
                        {obs.issues.join(', ')}
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-[#E2ECF8] flex flex-wrap items-center gap-2">
                      {!isConfirmed && (
                        <button
                          type="button"
                          disabled={submitting || hasIssues}
                          onClick={() => void handleConfirm(obs.observation_id)}
                          className="btn-pill-primary px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-40"
                        >
                          Confirm Observation
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleEdit(obs)}
                        className="btn-pill-secondary px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleDelete(obs.observation_id)}
                        className="px-4 py-1.5 rounded-full text-xs font-semibold text-[#D92D20] bg-white hover:bg-[#FEF3F2] border border-[#FECDCA] cursor-pointer transition-[background-color,border-color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97]"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-[#E2ECF8] flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={onContinueToIntake}
                className="btn-pill-primary flex-1 py-3.5 px-6 rounded-full font-bold text-xs text-white shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Continue to Context Questions</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
              <button
                type="button"
                disabled={submitting || observations.length === 0}
                onClick={() => void handleAssessLabPath()}
                className="btn-pill-secondary py-3.5 px-6 rounded-full font-bold text-xs cursor-pointer disabled:opacity-50"
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
