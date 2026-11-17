import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  clearPendingUploadFile,
  getPendingUploadFile,
  setPendingUploadFile,
  type ConsentCatalogue,
  type ConsentScope,
} from '../api/client';
import { UrgentLink } from '../components/UrgentLink';
import {
  createDefaultConsentDecisions,
  describeConsentSummary,
  mapConsentErrorToUserMessage,
  normalizeConsentDecisions,
  PLAIN_CONNECTION_ERROR,
} from './summaryModel';

interface ConsentScreenProps {
  caseId: string;
  onConsentComplete: (route: string) => void;
}

const SCOPE_DISPLAY_CONFIG: Record<
  string,
  {
    title: string;
    subtitle: string;
    renderIcon: () => React.ReactNode;
    required?: boolean;
  }
> = {
  assessment: {
    title: 'Health Assessment & Safety',
    subtitle:
      'Evaluates your health answers and optional lab tests to provide tailored guidance in this private session.',
    renderIcon: () => (
      <svg className="w-5 h-5 text-[#0066EE]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    required: true,
  },
  clinician_review: {
    title: 'Specialist Review (Simulated · Mock)',
    subtitle:
      'Allows a simulated healthcare reviewer to check your draft assessment and provide feedback.',
    renderIcon: () => (
      <svg className="w-5 h-5 text-[#0066EE]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  provider_share: {
    title: 'Care Referral & Booking (Simulated · Mock)',
    subtitle:
      'Prepares a mock referral summary for simulated partner facilities if you wish to explore follow-up care.',
    renderIcon: () => (
      <svg className="w-5 h-5 text-[#0066EE]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
};

export const ConsentScreen: React.FC<ConsentScreenProps> = ({
  caseId,
  onConsentComplete,
}) => {
  const [scopesConfig, setScopesConfig] = useState<ConsentScope[]>([]);
  const [consentCatalogue, setConsentCatalogue] = useState<ConsentCatalogue | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<Record<string, boolean>>(() =>
    createDefaultConsentDecisions('assessment_only'),
  );
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [showInactive, setShowInactive] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(() => getPendingUploadFile());
  const [loading, setLoading] = useState(false);
  const [loadingCopy, setLoadingCopy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);

  const assessmentBtnRef = useRef<HTMLButtonElement | null>(null);
  const educationBtnRef = useRef<HTMLButtonElement | null>(null);

  const isUploadMode =
    typeof sessionStorage !== 'undefined' &&
    sessionStorage.getItem('sanad_case_start_mode') === 'UPLOAD';

  const fetchConsentData = useCallback(async () => {
    try {
      const [catalogue, current] = await Promise.all([
        api.getCurrentConsent(),
        api.getCaseConsent(caseId),
      ]);
      setConsentCatalogue(catalogue);
      setScopesConfig(catalogue.scopes);
      setError(null);
      setConnectionError(false);

      const grantValues = Object.values(current.scopes);
      const hasPriorDecision = grantValues.some(
        g => g.granted || g.captured_at !== null || g.revoked_at !== null,
      );
      if (hasPriorDecision) {
        const fromServer = Object.fromEntries(
          Object.entries(current.scopes).map(([key, value]) => [key, value.granted]),
        );
        setSelectedScopes(normalizeConsentDecisions(fromServer, catalogue.scopes));
      } else {
        setSelectedScopes(prev => normalizeConsentDecisions(prev, catalogue.scopes));
      }
    } catch (err: unknown) {
      const mapped = mapConsentErrorToUserMessage(err);
      console.warn(mapped.errorCode);
      setError(mapped.userMessage);
      setConnectionError(true);
    } finally {
      setLoadingCopy(false);
    }
  }, [caseId]);

  const handleTryAgain = () => {
    setLoadingCopy(true);
    setError(null);
    setConnectionError(false);
    void fetchConsentData();
  };

  useEffect(() => {
    let mounted = true;
    Promise.all([api.getCurrentConsent(), api.getCaseConsent(caseId)])
      .then(([catalogue, current]) => {
        if (!mounted) return;
        setConsentCatalogue(catalogue);
        setScopesConfig(catalogue.scopes);
        setError(null);
        setConnectionError(false);

        const grantValues = Object.values(current.scopes);
        const hasPriorDecision = grantValues.some(
          g => g.granted || g.captured_at !== null || g.revoked_at !== null,
        );
        if (hasPriorDecision) {
          const fromServer = Object.fromEntries(
            Object.entries(current.scopes).map(([key, value]) => [key, value.granted]),
          );
          setSelectedScopes(normalizeConsentDecisions(fromServer, catalogue.scopes));
        } else {
          setSelectedScopes(prev => normalizeConsentDecisions(prev, catalogue.scopes));
        }
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        const mapped = mapConsentErrorToUserMessage(err);
        console.warn(mapped.errorCode);
        setError(mapped.userMessage);
        setConnectionError(true);
      })
      .finally(() => {
        if (mounted) setLoadingCopy(false);
      });
    return () => {
      mounted = false;
    };
  }, [caseId]);

  const handleToggle = (scopeName: string) => {
    setError(null);
    setStatusNotice(null);

    setSelectedScopes(prev => {
      const willEnable = !prev[scopeName];

      if (scopeName === 'assessment' && !willEnable) {
        setStatusNotice(
          'Turned off optional review and referral because health assessment was disabled.',
        );
        return createDefaultConsentDecisions('education');
      }

      if (scopeName !== 'assessment' && willEnable && !prev.assessment) {
        setStatusNotice(
          'Please enable Health Assessment first before selecting this optional service.',
        );
        return prev;
      }

      return normalizeConsentDecisions(
        {
          ...prev,
          [scopeName]: willEnable,
        },
        scopesConfig,
      );
    });
  };

  const applyPreset = (preset: 'assessment_only' | 'education') => {
    setStatusNotice(
      preset === 'assessment_only'
        ? 'Enabled private health assessment. Optional sharing permissions remain off by default.'
        : 'All permissions turned off. You will proceed to general health education only.',
    );
    setSelectedScopes(
      normalizeConsentDecisions(createDefaultConsentDecisions(preset), scopesConfig),
    );
  };

  const handlePresetKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentPreset: 'assessment_only' | 'education',
  ) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const nextPreset =
        currentPreset === 'assessment_only' ? 'education' : 'assessment_only';
      applyPreset(nextPreset);
      if (nextPreset === 'assessment_only') {
        assessmentBtnRef.current?.focus();
      } else {
        educationBtnRef.current?.focus();
      }
    }
  };

  const toggleDetails = (scope: string) => {
    setExpandedDetails(prev => ({
      ...prev,
      [scope]: !prev[scope],
    }));
  };

  const handleDeclineToEducation = async () => {
    setLoading(true);
    setError(null);
    setStatusNotice(null);
    try {
      if (consentCatalogue && !connectionError) {
        const allDeclined = normalizeConsentDecisions(
          createDefaultConsentDecisions('education'),
          scopesConfig,
        );
        const result = await api.updateCaseConsent(
          caseId,
          consentCatalogue.consent_version,
          allDeclined,
        );
        onConsentComplete(result.state?.route || '/education');
        return;
      }
    } catch {
      console.warn('SANAD_ERR_EDUCATION_FALLBACK');
    } finally {
      setLoading(false);
    }
    // General education records no health answers, so it stays reachable when the API is down.
    onConsentComplete('/education');
  };

  const handlePrimaryAction = async () => {
    const decisions = normalizeConsentDecisions(selectedScopes, scopesConfig);

    // When "Education only" is selected, proceed to general education (even if API is unreachable).
    if (!decisions.assessment) {
      await handleDeclineToEducation();
      return;
    }

    // Assessment requires saving consent on the server first.
    if (connectionError || !consentCatalogue) {
      setError(PLAIN_CONNECTION_ERROR);
      setConnectionError(true);
      return;
    }

    if (isUploadMode && !uploadFile) {
      setError('Please select a synthetic JSON profile file to upload before continuing.');
      return;
    }

    setLoading(true);
    setError(null);
    setStatusNotice(null);
    try {
      const result = await api.updateCaseConsent(
        caseId,
        consentCatalogue.consent_version,
        decisions,
      );

      let route =
        result.state?.route || (decisions.assessment ? '/safety' : '/education');

      if (decisions.assessment && result.state?.allowed_actions.includes('LOAD_PROFILE')) {
        const startMode =
          typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem('sanad_case_start_mode')
            : null;
        if (startMode === 'SAMPLE') {
          const profileState = await api.applySampleProfile(caseId);
          route = profileState.route;
        } else if (startMode === 'UPLOAD' && uploadFile) {
          const profileState = await api.uploadProfile(caseId, uploadFile);
          clearPendingUploadFile();
          route = profileState.route;
        }
      }

      onConsentComplete(route);
    } catch (err: unknown) {
      const mapped = mapConsentErrorToUserMessage(err);
      console.warn(mapped.errorCode);
      setError(mapped.userMessage);
      if (mapped.isConnectionError) {
        setConnectionError(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const activeScopes = scopesConfig.filter(s => s.used_in_this_flow !== false);
  const inactiveScopes = scopesConfig.filter(s => s.used_in_this_flow === false);
  const summary = describeConsentSummary(selectedScopes, scopesConfig);
  const isAssessmentEnabled = Boolean(summary.decisions.assessment);

  const isAssessmentBlockedByConnection =
    isAssessmentEnabled && (loadingCopy || connectionError || !consentCatalogue);
  const isAssessmentBlockedByUpload =
    isAssessmentEnabled && isUploadMode && !uploadFile;
  const isPrimaryDisabled =
    loading || isAssessmentBlockedByConnection || isAssessmentBlockedByUpload;

  const primaryDisabledReason = isAssessmentBlockedByConnection
    ? 'Waiting for the connection'
    : isAssessmentBlockedByUpload
    ? 'Select a synthetic profile JSON file above to continue'
    : null;

  return (
    <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-6 sm:py-10">
      <div className="medical-canvas p-6 sm:p-10 lg:p-12">
        {/* Header — no stock photo or broken image */}
        <div className="mb-8 pb-6 border-b border-[#E2ECF8] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#072254] tracking-tight">
              Privacy & Information Boundaries
            </h1>
            <p className="text-[#4A6588] text-sm sm:text-base leading-relaxed max-w-2xl">
              Choose how your information is used in this session. Optional sharing permissions
              start off by default, and Sanad does not ask for your name, phone number, or national
              ID. Synthetic data only.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <UrgentLink />
          </div>
        </div>

        {loadingCopy && (
          <div className="space-y-4 my-6">
            <div className="flex items-center gap-2 text-xs font-medium text-[#0062FF]">
              <div className="spinner spinner-sm" />
              <span>Loading privacy settings & consent scopes…</span>
            </div>
          </div>
        )}

        {/* Friendly Error Alert with Try Again & Urgent Help */}
        {error && (
          <div
            role="alert"
            data-testid="consent-error-alert"
            className="mb-6 p-4 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318] text-sm font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <span>{error}</span>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                data-testid="consent-try-again"
                onClick={handleTryAgain}
                className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#D92D20] text-white hover:bg-[#B42318] transition-colors cursor-pointer"
              >
                Try again
              </button>
              <a
                href="/urgent.html"
                className="px-3.5 py-1.5 rounded-full text-xs font-bold text-[#D92D20] bg-white border border-[#FECDCA] hover:bg-[#FEE4E2] no-underline"
              >
                Urgent Help
              </a>
            </div>
          </div>
        )}

        {statusNotice && !error && (
          <div
            role="status"
            className="mb-6 p-3.5 rounded-xl bg-[#F0F7FF] border border-[#BCD8FE] text-[#0066EE] text-xs font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-[#0066EE] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{statusNotice}</span>
          </div>
        )}

        {/* Quick Setup Options + Plain-Language Scope Breakdown */}
        <div className="mb-6 p-5 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF8] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[#072254]">
              Quick Setup Options:
            </span>
            <div
              role="group"
              aria-label="Quick Setup Options"
              className="flex flex-wrap items-center gap-2.5"
            >
              <button
                ref={assessmentBtnRef}
                type="button"
                data-testid="preset-health-assessment"
                aria-pressed={isAssessmentEnabled}
                onClick={() => applyPreset('assessment_only')}
                onKeyDown={e => handlePresetKeyDown(e, 'assessment_only')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                  isAssessmentEnabled
                    ? 'bg-[#0066EE] text-white border-[#0066EE] shadow-xs'
                    : 'bg-white text-[#072254] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                }`}
              >
                {isAssessmentEnabled && <span aria-hidden="true">✓</span>}
                <span>Health Assessment (Essential)</span>
              </button>
              <button
                ref={educationBtnRef}
                type="button"
                data-testid="preset-education-only"
                aria-pressed={!isAssessmentEnabled}
                onClick={() => applyPreset('education')}
                onKeyDown={e => handlePresetKeyDown(e, 'education')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                  !isAssessmentEnabled
                    ? 'bg-[#0066EE] text-white border-[#0066EE] shadow-xs'
                    : 'bg-white text-[#072254] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                }`}
              >
                {!isAssessmentEnabled && <span aria-hidden="true">✓</span>}
                <span>Education only (All Off)</span>
              </button>
            </div>
          </div>

          {/* Plain-words list of what is on and off for the current choice */}
          <div
            data-testid="consent-scope-summary"
            className="pt-3 border-t border-[#E2ECF8] text-xs text-[#334155] space-y-1.5"
          >
            <p>
              <strong className="text-[#072254]">Turned on for this choice:</strong>{' '}
              {summary.enabledScopes.length > 0
                ? summary.enabledScopes.map(item => item.label).join(', ')
                : 'None — general education only (no health answers recorded)'}
            </p>
            <p>
              <strong className="text-[#072254]">Turned off by default:</strong>{' '}
              {summary.disabledScopes.map(item => item.label).join(', ')}
            </p>
            <ul className="sr-only" aria-label="Consent scope states">
              {Object.entries(summary.decisions).map(([scopeKey, enabled]) => (
                <li
                  key={scopeKey}
                  data-testid={`scope-state-${scopeKey}`}
                  data-scope={scopeKey}
                  data-enabled={String(enabled)}
                >
                  {scopeKey}: {enabled ? 'on' : 'off'}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Upload Mode File Selector */}
        {isUploadMode && (
          <div className="mb-6 p-5 rounded-2xl bg-[#F8FAFD] border border-[#BCD8FE] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#0066EE]">
                Synthetic Profile Upload
              </span>
            </div>
            {uploadFile ? (
              <p className="text-xs text-[#072254]">
                File ready to apply: <strong>{uploadFile.name}</strong> ({uploadFile.size} bytes)
              </p>
            ) : (
              <div className="space-y-2">
                <label
                  htmlFor="consent-upload-input"
                  className="block text-xs font-semibold text-[#072254]"
                >
                  Select test profile JSON to apply after consent:
                </label>
                <input
                  id="consent-upload-input"
                  type="file"
                  accept=".json,application/json"
                  onChange={e => {
                    const file = e.target.files?.[0] ?? null;
                    setUploadFile(file);
                    setPendingUploadFile(file);
                  }}
                  className="w-full text-xs border border-[#E2ECF8] p-2 bg-white rounded-xl"
                />
              </div>
            )}
          </div>
        )}

        {/* Active Scopes Cards */}
        <div className="space-y-3.5 mb-8">
          {activeScopes.map(scopeItem => {
            const isEnabled = Boolean(summary.decisions[scopeItem.scope]);
            const isChildScope = scopeItem.scope !== 'assessment';
            const isLocked = isChildScope && !isAssessmentEnabled;
            const meta = SCOPE_DISPLAY_CONFIG[scopeItem.scope] || {
              title: scopeItem.scope.replace(/_/g, ' '),
              subtitle: scopeItem.used_for,
              renderIcon: () => (
                <svg className="w-5 h-5 text-[#0066EE]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ),
            };
            const isDetailsOpen = Boolean(expandedDetails[scopeItem.scope]);

            return (
              <div
                key={scopeItem.scope}
                className={`p-4 sm:p-5 rounded-2xl border transition-[background-color,border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] ${
                  isLocked
                    ? 'bg-[#FAFBFD] border-[#E2ECF8] opacity-75'
                    : isEnabled
                    ? 'bg-[#F0F7FF] border-[#0066EE] shadow-xs'
                    : 'bg-white border-[#E2ECF8] hover:border-[#BCD8FE]'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white border border-[#BCD8FE] flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                      {meta.renderIcon()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-bold text-[#072254]">
                          {meta.title}
                        </h2>
                        {meta.required && (
                          <span className="text-[11px] font-semibold text-[#0066EE] bg-[#EBF3FF] px-2 py-0.5 rounded-full">
                            Core
                          </span>
                        )}
                        {isLocked && (
                          <span className="text-[10px] font-medium text-[#829AB8] bg-[#F1F5F9] px-2 py-0.5 rounded-full border border-[#E2ECF8]">
                            Requires Health Assessment
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-[#4A6588] leading-relaxed mt-1">
                        {meta.subtitle}
                      </p>

                      <button
                        type="button"
                        onClick={() => toggleDetails(scopeItem.scope)}
                        className="text-[11px] font-medium text-[#0066EE] hover:underline mt-2 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isDetailsOpen ? 'Hide coverage details' : 'Show coverage details'}</span>
                        <svg
                          className={`w-3.5 h-3.5 text-[#0066EE] transition-transform duration-160 ease-[var(--ease-out)] ${
                            isDetailsOpen ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${meta.title}`}
                      onClick={() => handleToggle(scopeItem.scope)}
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-160 ease-[var(--ease-out)] p-0.5 active:scale-[0.96] ${
                        isEnabled ? 'bg-[#0066EE]' : 'bg-[#CBD5E1]'
                      } ${isLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-xs transition-transform duration-160 ease-[var(--ease-out)] ${
                          isEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className={`text-[11px] font-medium ${isEnabled ? 'text-[#0066EE]' : 'text-[#829AB8]'}`}>
                      {isEnabled ? 'Enabled' : 'Off'}
                    </span>
                  </div>
                </div>

                {/* Collapsible Coverage Details */}
                {isDetailsOpen && (
                  <div className="mt-4 pt-3 border-t border-[#E2ECF8] space-y-2 text-xs text-[#4A6588] bg-white/60 p-3 rounded-xl">
                    <p>
                      <strong className="text-[#072254]">Information covered:</strong> {scopeItem.data_covered}
                    </p>
                    <p>
                      <strong className="text-[#072254]">Who sees it:</strong> {scopeItem.who_sees_it}
                    </p>
                    {!isEnabled && (
                      <p className="text-[#B54708]">
                        <strong>If turned off:</strong> {scopeItem.if_off}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Inactive Scopes Collapsible */}
        {inactiveScopes.length > 0 && (
          <div className="mb-8 pt-2">
            <button
              type="button"
              onClick={() => setShowInactive(!showInactive)}
              className="text-xs text-[#829AB8] hover:text-[#072254] inline-flex items-center gap-1.5 cursor-pointer font-medium"
            >
              <span>{showInactive ? 'Hide disabled permissions' : 'Show disabled permissions (Partner sharing, Research)'}</span>
              <svg
                className={`w-3.5 h-3.5 text-[#829AB8] transition-transform duration-160 ease-[var(--ease-out)] ${
                  showInactive ? 'rotate-180' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showInactive && (
              <div className="mt-3 p-4 rounded-xl bg-[#F8FAFD] border border-[#E2ECF8] space-y-3">
                {inactiveScopes.map(scopeItem => (
                  <div key={scopeItem.scope} className="text-xs text-[#829AB8]">
                    <span className="font-semibold text-[#4A6588] capitalize">
                      {scopeItem.scope.replace(/_/g, ' ')}
                    </span>: Permanently disabled in this release. No data is shared.
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div className="pt-6 border-t border-[#E2ECF8] flex flex-col items-center gap-3">
          <div className="w-full flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              data-testid="consent-primary-button"
              disabled={isPrimaryDisabled}
              onClick={() => void handlePrimaryAction()}
              className={`w-full sm:flex-1 py-4 px-6 rounded-full text-sm font-bold transition-colors ${
                isPrimaryDisabled
                  ? 'bg-[#CBD5E1] text-[#475467] cursor-not-allowed'
                  : 'bg-[#0066EE] text-white hover:bg-[#0055CC] shadow-md cursor-pointer'
              }`}
            >
              {loading
                ? 'Saving preferences…'
                : isAssessmentEnabled
                ? 'Continue to health assessment'
                : 'Continue to general education'}
            </button>

            {isAssessmentEnabled && (
              <button
                type="button"
                data-testid="skip-to-education"
                disabled={loading}
                onClick={() => void handleDeclineToEducation()}
                className="py-3 px-4 text-xs font-semibold text-[#0050CC] hover:text-[#003E99] underline cursor-pointer whitespace-nowrap"
              >
                Skip to general education
              </button>
            )}
          </div>

          {primaryDisabledReason && (
            <p
              data-testid="primary-button-disabled-reason"
              className="text-xs font-medium text-[#B54708]"
            >
              {primaryDisabledReason}
            </p>
          )}
        </div>

        <p className="text-center text-[11px] text-[#829AB8] mt-4">
          {isAssessmentEnabled
            ? 'Proceeding to Safety Check. Your answers stay in this session.'
            : 'Proceeding to General Education without recording any health answers.'}
        </p>
      </div>
    </div>
  );
};
