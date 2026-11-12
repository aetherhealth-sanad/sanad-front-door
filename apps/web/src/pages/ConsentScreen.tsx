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
  { title: string; subtitle: string; icon: string; required?: boolean }
> = {
  assessment: {
    title: 'Health Assessment & Safety',
    subtitle:
      'Evaluates your health answers and optional lab tests to provide tailored guidance in this private session.',
    icon: '📋',
    required: true,
  },
  clinician_review: {
    title: 'Specialist Review (Simulated)',
    subtitle:
      'Allows a simulated healthcare reviewer to check your draft assessment and provide feedback.',
    icon: '👨‍⚕️',
  },
  provider_share: {
    title: 'Care Referral & Booking (Simulated)',
    subtitle:
      'Prepares a referral summary for partner facilities if you wish to explore follow-up medical care.',
    icon: '🏥',
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
        setStatusNotice('Turned off specialist review and referral because health assessment is disabled.');
        return next;
      }

      if (scopeName !== 'assessment' && willEnable && !prev.assessment) {
        // Enabling a child scope while assessment is off: auto-enable assessment as well
        setStatusNotice('Health assessment enabled automatically as it is required for this service.');
        return {
          ...prev,
          assessment: true,
          [scopeName]: true,
        };
      }

      return {
        ...prev,
        [scopeName]: willEnable,
      };
    });
  };

  const applyPreset = (preset: 'recommended' | 'essential' | 'education') => {
    setError(null);
    if (preset === 'recommended') {
      setSelectedScopes({
        assessment: true,
        clinician_review: true,
        provider_share: true,
      });
      setStatusNotice('Enabled recommended settings: full health check, review, and care navigation.');
    } else if (preset === 'essential') {
      setSelectedScopes({
        assessment: true,
        clinician_review: false,
        provider_share: false,
      });
      setStatusNotice('Enabled essential settings: private health check only, without external review.');
    } else {
      setSelectedScopes({
        assessment: false,
        clinician_review: false,
        provider_share: false,
      });
      setStatusNotice('All permissions disabled. You will view general education guides only.');
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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="medical-canvas p-6 sm:p-10">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-[#E2ECF8] flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#072254] tracking-tight">
              Privacy & Consent Choices
            </h1>
            <p className="text-[#4A6588] text-sm sm:text-base leading-relaxed max-w-xl">
              Choose how your session information is used. Everything is private, anonymous, and stored only on this device. You can adjust permissions at any time.
            </p>
          </div>
          <img
            src="/assets/images/medical_shield_3d.jpg"
            alt="Medical Privacy Shield"
            className="w-20 h-20 rounded-2xl object-cover border-2 border-[#BCD8FE] shadow-sm shrink-0 hidden sm:block"
          />
        </div>

        {loadingCopy && (
          <p className="mb-6 text-sm text-[#0066EE] animate-pulse">Loading privacy settings...</p>
        )}

        {/* Status or Error Notifications */}
        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] text-sm font-medium"
          >
            {error}
          </div>
        )}

        {statusNotice && !error && (
          <div
            role="status"
            className="mb-6 p-3.5 rounded-xl bg-[#F0F7FF] border border-[#BCD8FE] text-[#0066EE] text-xs font-medium flex items-center gap-2"
          >
            <span>ℹ️</span>
            <span>{statusNotice}</span>
          </div>
        )}

        {/* Quick Presets */}
        <div className="mb-6 p-4 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF8]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[#072254]">
              Quick Setup Options:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => applyPreset('recommended')}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#0066EE] text-white hover:bg-[#0055CC] transition-colors shadow-xs cursor-pointer active:scale-[0.98]"
              >
                Recommended (Full Check)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('essential')}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-white text-[#072254] border border-[#BCD8FE] hover:bg-[#EBF3FF] transition-colors cursor-pointer active:scale-[0.98]"
              >
                Essential Only
              </button>
              <button
                type="button"
                onClick={() => applyPreset('education')}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-white text-[#4A6588] border border-[#E2ECF8] hover:bg-[#F8FAFD] transition-colors cursor-pointer active:scale-[0.98]"
              >
                Education Only
              </button>
            </div>
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
            const isEnabled = !!selectedScopes[scopeItem.scope];
            const meta = SCOPE_DISPLAY_CONFIG[scopeItem.scope] || {
              title: scopeItem.scope.replace(/_/g, ' '),
              subtitle: scopeItem.used_for,
              icon: '🔒',
            };
            const isDetailsOpen = !!expandedDetails[scopeItem.scope];

            return (
              <div
                key={scopeItem.scope}
                className={`p-4 sm:p-5 rounded-2xl border transition-[background-color,border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] ${
                  isEnabled
                    ? 'bg-[#F0F7FF] border-[#0066EE] shadow-xs'
                    : 'bg-white border-[#E2ECF8] hover:border-[#BCD8FE]'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="text-xl sm:text-2xl shrink-0 mt-0.5">{meta.icon}</span>
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
                        <span>{isDetailsOpen ? '▲' : '▼'}</span>
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
                      }`}
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
              <span>{showInactive ? '▲' : '▼'}</span>
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
        <div className="pt-6 border-t border-[#E2ECF8] flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            disabled={loading || loadingCopy || !consentCatalogue}
            onClick={() => void handleAgree()}
            className="btn-pill-primary w-full sm:flex-1 py-3.5 px-6 text-sm disabled:opacity-50 cursor-pointer"
          >
            {loading
              ? 'Saving Preferences...'
              : isAssessmentEnabled
              ? 'Save Preferences & Continue →'
              : 'Continue to Health Education →'}
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

        <p className="text-center text-[11px] text-[#829AB8] mt-4">
          {isAssessmentEnabled
            ? 'Proceeding to Safety Check. All responses are kept private to this session.'
            : 'Proceeding to General Guides without recording any health answers.'}
        </p>
      </div>
    </div>
  );
};
