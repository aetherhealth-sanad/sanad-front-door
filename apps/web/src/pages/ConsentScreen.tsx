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

export const ConsentScreen: React.FC<ConsentScreenProps> = ({
  caseId,
  onConsentComplete,
}) => {
  const [scopesConfig, setScopesConfig] = useState<ConsentScope[]>([]);
  const [consentCatalogue, setConsentCatalogue] = useState<ConsentCatalogue | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<Record<string, boolean>>({});
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
    if (scopeName !== 'assessment' && !selectedScopes.assessment && !selectedScopes[scopeName]) {
      setError('Grant assessment consent before enabling another consent scope.');
      return;
    }
    setError(null);
    setSelectedScopes(prev => {
      const next = { ...prev, [scopeName]: !prev[scopeName] };
      if (scopeName === 'assessment' && !next.assessment) {
        for (const scope of Object.keys(next)) next[scope] = false;
      }
      return next;
    });
  };

  const handleAgree = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!consentCatalogue) {
        throw new Error(
          'Consent information is unavailable. Reload this page after the API is available.',
        );
      }
      const startMode = sessionStorage.getItem('sanad_case_start_mode');
      if (selectedScopes.assessment && startMode === 'UPLOAD' && !uploadFile) {
        throw new Error('Select a synthetic JSON profile file to upload after consent.');
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
    try {
      if (!consentCatalogue) throw new Error('Consent information is unavailable.');
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

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="medical-canvas p-6 sm:p-10">
        <div className="mb-8 pb-6 border-b border-[#E2ECF8] flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-mono text-xs text-[#0066EE] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full border border-[#BCD8FE] font-bold">
                PURPOSE CONSENT
              </span>
              {consentCatalogue && (
                <span className="font-mono text-xs text-[#829AB8] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full border border-[#BCD8FE]">
                  VERSION: {consentCatalogue.consent_version}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#072254] tracking-tight">
              Your Privacy & Information Boundaries
            </h1>
            <p className="text-[#4A6588] text-sm sm:text-base leading-relaxed max-w-xl">
              Choose exactly how your health data is processed. You remain in full control: optional permissions start disabled, and no real identifying details are ever recorded.
            </p>
          </div>
          <img
            src="/assets/images/medical_shield_3d.jpg"
            alt="Medical Privacy Shield"
            className="w-20 h-20 rounded-2xl object-cover border-2 border-[#BCD8FE] shadow-sm shrink-0 hidden sm:block"
          />
        </div>

        {loadingCopy && (
          <p className="mb-6 text-sm font-mono text-[#0066EE] animate-pulse">Loading consent ledger...</p>
        )}

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] text-sm font-medium"
          >
            {error}
          </div>
        )}

        {isUploadMode && (
          <div className="mb-6 p-5 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF8] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-[#0066EE]">
                SYNTHETIC PROFILE UPLOAD QUEUED (RF-02)
              </span>
            </div>
            {uploadFile ? (
              <p className="text-xs font-mono text-[#072254]">
                Ready to apply after assessment consent: <strong>{uploadFile.name}</strong> (
                {uploadFile.size} bytes)
              </p>
            ) : (
              <div className="space-y-2">
                <label
                  htmlFor="consent-upload-input"
                  className="block text-xs font-mono font-bold text-[#072254]"
                >
                  Select synthetic JSON profile to apply after consent:
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
                  className="w-full text-xs font-mono border border-[#E2ECF8] p-2 bg-white rounded-xl"
                />
              </div>
            )}
          </div>
        )}

        {/* Scopes Ledger Cards */}
        <div className="space-y-4 mb-8">
          {scopesConfig.map(scopeItem => {
            const isEnabled = !!selectedScopes[scopeItem.scope];
            const isUsable = scopeItem.used_in_this_flow !== false;

            return (
              <div
                key={scopeItem.scope}
                className={`p-5 rounded-2xl border transition-[background-color,border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] ${
                  !isUsable
                    ? 'bg-[#F8FAFD] border-[#E2ECF8] opacity-75'
                    : isEnabled
                    ? 'bg-[#EBF3FF] border-[#0066EE] shadow-xs'
                    : 'bg-white border-[#E2ECF8] hover:border-[#BCD8FE]'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <h2 className="text-base font-extrabold text-[#072254] capitalize">
                        {scopeItem.scope.replace(/_/g, ' ')}
                      </h2>
                      <span className="font-mono text-[10px] px-2.5 py-0.5 rounded-full bg-white border border-[#BCD8FE] text-[#0066EE] font-semibold">
                        {scopeItem.who_sees_it}
                      </span>
                      {!isUsable && (
                        <span className="text-[10px] font-mono font-bold text-[#829AB8] bg-white px-2 py-0.5 rounded-full border border-[#E2ECF8]">
                          Not in this version
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#072254] mb-1.5 leading-relaxed">
                      <strong>Covers:</strong> {scopeItem.data_covered}
                    </p>
                    <p className="text-xs text-[#4A6588] leading-relaxed">
                      <strong>Used for:</strong> {scopeItem.used_for}
                    </p>
                    {!isEnabled && isUsable && (
                      <p className="text-xs text-[#B54708] bg-[#FFFBEB] border border-[#FEDF89] p-2.5 rounded-xl mt-3 font-medium">
                        <strong>If disabled:</strong> {scopeItem.if_off}
                      </p>
                    )}
                  </div>

                  {isUsable && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${scopeItem.scope.replace(
                        /_/g,
                        ' ',
                      )} consent`}
                      onClick={() => handleToggle(scopeItem.scope)}
                      className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full transition-colors duration-160 ease-[var(--ease-out)] p-0.5 active:scale-[0.96] ${
                        isEnabled ? 'bg-[#0066EE]' : 'bg-[#CBD5E1]'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-xs transition-transform duration-160 ease-[var(--ease-out)] ${
                          isEnabled ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Decisions Action Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-6 border-t border-[#E2ECF8]">
          <button
            type="button"
            disabled={loading || loadingCopy || !consentCatalogue}
            onClick={() => void handleAgree()}
            className="btn-pill-primary w-full sm:flex-1 py-4 px-6 text-sm disabled:opacity-50"
          >
            {loading ? 'Recording Consent...' : 'Save Preferences & Continue →'}
          </button>

          <button
            type="button"
            disabled={loading || loadingCopy || !consentCatalogue}
            onClick={() => void handleDecline()}
            className="btn-pill-secondary w-full sm:w-auto py-4 px-6 text-xs"
          >
            Decline (Education Only)
          </button>
        </div>
      </div>
    </div>
  );
};
