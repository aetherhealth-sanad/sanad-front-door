import { useEffect, useState } from 'react';
import {
  api,
  clearPendingUploadFile,
  getPendingUploadFile,
  setPendingUploadFile,
  type ConsentCatalogue,
  type ConsentScope,
} from '../api/client';

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
      <svg className="w-5 h-5 text-[#1F4D3F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    required: true,
  },
  clinician_review: {
    title: 'Specialist Review (Simulated)',
    subtitle:
      'Allows a simulated healthcare reviewer to check your draft assessment and provide feedback.',
    renderIcon: () => (
      <svg className="w-5 h-5 text-[#1F4D3F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  provider_share: {
    title: 'Care Referral & Booking (Simulated)',
    subtitle:
      'Prepares a referral summary for partner facilities if you wish to explore follow-up medical care.',
    renderIcon: () => (
      <svg className="w-5 h-5 text-[#1F4D3F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
  const [selectedScopes, setSelectedScopes] = useState<Record<string, boolean>>({});
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [showInactive, setShowInactive] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(() => getPendingUploadFile());
  const [loading, setLoading] = useState(false);
  const [loadingCopy, setLoadingCopy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isUploadMode = sessionStorage.getItem('sanad_case_start_mode') === 'UPLOAD';

  useEffect(() => {
    let mounted = true;
    Promise.all([api.getCurrentConsent(), api.getCaseConsent(caseId)])
      .then(([catalogue, current]) => {
        if (!mounted) return;
        setConsentCatalogue(catalogue);
        setScopesConfig(catalogue.scopes);
        setSelectedScopes(
          Object.fromEntries(
            Object.entries(current.scopes).map(([key, value]) => [key, value.granted]),
          ),
        );
      })
      .catch((err: Error) => {
        if (mounted) setError(err.message || 'Consent information is unavailable.');
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
        // Toggling assessment off: automatically turn off all dependent scopes
        const next: Record<string, boolean> = {};
        for (const k of Object.keys(prev)) next[k] = false;
        setStatusNotice('Turned off optional review and referral because health assessment was disabled.');
        return next;
      }

      if (scopeName !== 'assessment' && willEnable && !prev.assessment) {
        // Explicit consent: do NOT auto-enable assessment without user's explicit action
        setStatusNotice('Please enable Health Assessment first before selecting this optional service.');
        return prev;
      }

      return {
        ...prev,
        [scopeName]: willEnable,
      };
    });
  };

  const applyPreset = (preset: 'assessment_only' | 'education') => {
    setError(null);
    if (preset === 'assessment_only') {
      setSelectedScopes({
        assessment: true,
        clinician_review: false,
        provider_share: false,
      });
      setStatusNotice('Enabled private health assessment. Optional sharing permissions remain disabled by default.');
    } else {
      setSelectedScopes({
        assessment: false,
        clinician_review: false,
        provider_share: false,
      });
      setStatusNotice('All permissions disabled. You will proceed to general health guides only.');
    }
  };

  const toggleDetails = (scope: string) => {
    setExpandedDetails(prev => ({
      ...prev,
      [scope]: !prev[scope],
    }));
  };

  const handleAgree = async () => {
    setLoading(true);
    setError(null);
    setStatusNotice(null);
    try {
      if (!consentCatalogue) {
        throw new Error('Consent configuration is unavailable. Please refresh the page.');
      }
      const startMode = sessionStorage.getItem('sanad_case_start_mode');
      if (selectedScopes.assessment && startMode === 'UPLOAD' && !uploadFile) {
        throw new Error('Please select a synthetic JSON profile file to upload before continuing.');
      }

      const result = await api.updateCaseConsent(
        caseId,
        consentCatalogue.consent_version,
        selectedScopes,
      );

      let route =
        result.state?.route || (selectedScopes.assessment ? '/safety' : '/education');

      if (selectedScopes.assessment && result.state?.allowed_actions.includes('LOAD_PROFILE')) {
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
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to record consent. Please retry.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    setLoading(true);
    setError(null);
    setStatusNotice(null);
    try {
      if (!consentCatalogue) throw new Error('Consent configuration is unavailable.');
      const allDeclined: Record<string, boolean> = {};
      for (const s of scopesConfig) allDeclined[s.scope] = false;
      const result = await api.updateCaseConsent(
        caseId,
        consentCatalogue.consent_version,
        allDeclined,
      );
      onConsentComplete(result.state?.route || '/education');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not decline consent.');
    } finally {
      setLoading(false);
    }
  };

  const activeScopes = scopesConfig.filter(s => s.used_in_this_flow !== false);
  const inactiveScopes = scopesConfig.filter(s => s.used_in_this_flow === false);
  const isAssessmentEnabled = !!selectedScopes.assessment;

  return (
    <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-6 sm:py-10">
      <div className="medical-canvas p-6 sm:p-10 lg:p-12">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-[#E4DFD3] flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1F1C] tracking-tight">
              What this session may do
            </h1>
            <p className="text-[#575C55] text-sm sm:text-base leading-relaxed max-w-2xl">
              Choose exactly how your session information is used. You remain in full control: all optional permissions start disabled, no real personal identifiers (name, phone, or national ID) are ever recorded, and data is only processed for this private session.
            </p>
          </div>
        </div>

        {loadingCopy && (
          <div className="space-y-4 my-6">
            <div className="flex items-center gap-2 text-xs font-medium text-[#1F4D3F]">
              <div className="spinner spinner-sm" />
              <span>Loading privacy settings & consent scopes…</span>
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} className="p-4 sm:p-5 rounded-2xl border border-[#E4DFD3] bg-[#FBFAF6] space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl skeleton shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-1/3" />
                    <div className="skeleton h-3 w-3/4" />
                  </div>
                  <div className="w-12 h-6 rounded-full skeleton shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Status or Error Notifications */}
        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-[#FBEDEA] border border-[#F0C9C2] text-[#B3261E] text-sm font-medium"
          >
            {error}
          </div>
        )}

        {statusNotice && !error && (
          <div
            role="status"
            className="mb-6 p-3.5 rounded-xl bg-[#E8EFEA] border border-[#C8D6CC] text-[#1F4D3F] text-xs font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-[#1F4D3F] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{statusNotice}</span>
          </div>
        )}

        {/* Quick Presets */}
        <div className="mb-6 p-4 rounded-2xl bg-[#F7F5EF] border border-[#E4DFD3]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[#1A1F1C]">
              Quick Setup Options:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => applyPreset('assessment_only')}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#1F4D3F] text-white hover:bg-[#0055CC] transition-colors shadow-xs cursor-pointer active:scale-[0.98]"
              >
                Health Assessment (Essential)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('education')}
                className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-[#FBFAF6] text-[#575C55] border border-[#E4DFD3] hover:bg-[#F7F5EF] transition-colors cursor-pointer active:scale-[0.98]"
              >
                Education Only (All Off)
              </button>
            </div>
          </div>
        </div>

        {/* Upload Mode File Selector */}
        {isUploadMode && (
          <div className="mb-6 p-5 rounded-2xl bg-[#F7F5EF] border border-[#C8D6CC] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#1F4D3F]">
                Synthetic Profile Upload
              </span>
            </div>
            {uploadFile ? (
              <p className="text-xs text-[#1A1F1C]">
                File ready to apply: <strong>{uploadFile.name}</strong> ({uploadFile.size} bytes)
              </p>
            ) : (
              <div className="space-y-2">
                <label
                  htmlFor="consent-upload-input"
                  className="block text-xs font-semibold text-[#1A1F1C]"
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
                  className="w-full text-xs border border-[#E4DFD3] p-2 bg-[#FBFAF6] rounded-xl"
                />
              </div>
            )}
          </div>
        )}

        {/* Active Scopes Cards */}
        <div className="space-y-3.5 mb-8">
          {activeScopes.map(scopeItem => {
            const isEnabled = !!selectedScopes[scopeItem.scope];
            const isChildScope = scopeItem.scope !== 'assessment';
            const isLocked = isChildScope && !isAssessmentEnabled;
            const meta = SCOPE_DISPLAY_CONFIG[scopeItem.scope] || {
              title: scopeItem.scope.replace(/_/g, ' '),
              subtitle: scopeItem.used_for,
              renderIcon: () => (
                <svg className="w-5 h-5 text-[#1F4D3F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ),
            };
            const isDetailsOpen = !!expandedDetails[scopeItem.scope];

            return (
              <div
                key={scopeItem.scope}
                className={`p-4 sm:p-5 rounded-2xl border transition-[background-color,border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] ${
                  isLocked
                    ? 'bg-[#F7F5EF] border-[#E4DFD3] opacity-75'
                    : isEnabled
                    ? 'bg-[#E8EFEA] border-[#1F4D3F] shadow-xs'
                    : 'bg-[#FBFAF6] border-[#E4DFD3] hover:border-[#C8D6CC]'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#FBFAF6] border border-[#C8D6CC] flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                      {meta.renderIcon()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-bold text-[#1A1F1C]">
                          {meta.title}
                        </h2>
                        {meta.required && (
                          <span className="text-[11px] font-semibold text-[#1F4D3F] bg-[#E8EFEA] px-2 py-0.5 rounded-full">
                            Core
                          </span>
                        )}
                        {isLocked && (
                          <span className="text-[10px] font-medium text-[#8A8C84] bg-[#EFECE4] px-2 py-0.5 rounded-full border border-[#E4DFD3]">
                            Requires Health Assessment
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-[#575C55] leading-relaxed mt-1">
                        {meta.subtitle}
                      </p>

                      <button
                        type="button"
                        onClick={() => toggleDetails(scopeItem.scope)}
                        className="text-[11px] font-medium text-[#1F4D3F] hover:underline mt-2 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isDetailsOpen ? 'Hide coverage details' : 'Show coverage details'}</span>
                        <svg
                          className={`w-3.5 h-3.5 text-[#1F4D3F] transition-transform duration-160 ease-[var(--ease-out)] ${
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
                        isEnabled ? 'bg-[#1F4D3F]' : 'bg-[#D6D0C2]'
                      } ${isLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-[#FBFAF6] shadow-xs transition-transform duration-160 ease-[var(--ease-out)] ${
                          isEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className={`text-[11px] font-medium ${isEnabled ? 'text-[#1F4D3F]' : 'text-[#8A8C84]'}`}>
                      {isEnabled ? 'Enabled' : 'Off'}
                    </span>
                  </div>
                </div>

                {/* Collapsible Coverage Details */}
                {isDetailsOpen && (
                  <div className="mt-4 pt-3 border-t border-[#E4DFD3] space-y-2 text-xs text-[#575C55] bg-[#FBFAF6]/60 p-3 rounded-xl">
                    <p>
                      <strong className="text-[#1A1F1C]">Information covered:</strong> {scopeItem.data_covered}
                    </p>
                    <p>
                      <strong className="text-[#1A1F1C]">Who sees it:</strong> {scopeItem.who_sees_it}
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
              className="text-xs text-[#8A8C84] hover:text-[#1A1F1C] inline-flex items-center gap-1.5 cursor-pointer font-medium"
            >
              <span>{showInactive ? 'Hide disabled permissions' : 'Show disabled permissions (Partner sharing, Research)'}</span>
              <svg
                className={`w-3.5 h-3.5 text-[#8A8C84] transition-transform duration-160 ease-[var(--ease-out)] ${
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
              <div className="mt-3 p-4 rounded-xl bg-[#F7F5EF] border border-[#E4DFD3] space-y-3">
                {inactiveScopes.map(scopeItem => (
                  <div key={scopeItem.scope} className="text-xs text-[#8A8C84]">
                    <span className="font-semibold text-[#575C55] capitalize">
                      {scopeItem.scope.replace(/_/g, ' ')}
                    </span>: Permanently disabled in this release. No data is shared.
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div className="pt-6 border-t border-[#E4DFD3] flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            disabled={loading || loadingCopy || !consentCatalogue}
            onClick={() => void handleAgree()}
            className="btn-pill-primary w-full sm:flex-1 py-4 px-6 text-sm disabled:opacity-50 cursor-pointer shadow-[var(--shadow-1)]"
          >
            {loading ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="spinner spinner-sm spinner-white" />
                <span>Saving Preferences…</span>
              </span>
            ) : isAssessmentEnabled ? (
              'Save Preferences & Continue →'
            ) : (
              'Continue to Health Education →'
            )}
          </button>

          <button
            type="button"
            disabled={loading || loadingCopy || !consentCatalogue}
            onClick={() => void handleDecline()}
            className="btn-pill-secondary w-full sm:w-auto py-3.5 px-6 text-xs cursor-pointer"
          >
            Skip to General Education
          </button>
        </div>

        <p className="text-center text-[11px] text-[#8A8C84] mt-4">
          {isAssessmentEnabled
            ? 'Proceeding to Safety Check. All responses are kept private to this session.'
            : 'Proceeding to General Guides without recording any health answers.'}
        </p>
      </div>
    </div>
  );
};
