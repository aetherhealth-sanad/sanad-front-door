import { useEffect, useState } from 'react';
import {
  api,
  clearPendingUploadFile,
  getPendingUploadFile,
  setPendingUploadFile,
  type ConsentCatalogue,
  type ConsentScope,
} from '../api/client';
import { MockBadge } from '../components/MockBadge';

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
      setError(err instanceof Error ? err.message : 'Failed to record consent');
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!consentCatalogue) {
        throw new Error(
          'Consent information is unavailable. Reload this page after the API is available.',
        );
      }
      await api.updateCaseConsent(caseId, consentCatalogue.consent_version, {
        assessment: false,
      });
      onConsentComplete('/education');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record refusal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-8 pb-5 border-b border-[#0B1310]">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <MockBadge label={`MOCK CONSENT LEDGER · ${consentCatalogue?.copy_status ?? 'DRAFT'}`} />
          {consentCatalogue && (
            <span className="font-mono text-xs text-[#3F4E48]">
              VERSION: {consentCatalogue.consent_version}
            </span>
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] tracking-tight">
          How Your Health Information is Handled
        </h1>
        <p className="text-[#3F4E48] text-sm sm:text-base mt-2 leading-relaxed">
          Choose which parts of this research prototype you agree to use. Optional permissions start off and can be left disabled at any time.
        </p>
      </div>

      {loadingCopy && (
        <p className="mb-6 text-sm font-mono text-[#3F4E48]">Loading consent ledger…</p>
      )}

      {error && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-[2px] bg-[#FEF2F2] border border-[#B91C1C] text-[#7F1D1D] text-sm font-medium"
        >
          {error}
        </div>
      )}

      {isUploadMode && (
        <div className="mb-6 p-4 rounded-[2px] bg-white border border-[#0B1310] space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-[#0F523E]">
              SYNTHETIC PROFILE UPLOAD QUEUED (RF-02)
            </span>
            <MockBadge label="MOCK UPLOAD" />
          </div>
          {uploadFile ? (
            <p className="text-xs font-mono text-[#0B1310]">
              Ready to apply after assessment consent: <strong>{uploadFile.name}</strong> (
              {uploadFile.size} bytes)
            </p>
          ) : (
            <div className="space-y-2">
              <label
                htmlFor="consent-upload-input"
                className="block text-xs font-mono font-bold text-[#0B1310]"
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
                className="w-full text-xs font-mono border border-[#0B1310] p-2 bg-[#F3F4F1] rounded-[2px]"
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
              className={`p-5 rounded-[2px] border transition-all duration-150 ${
                !isUsable
                  ? 'bg-[#E6EAE4]/60 border-[#C5CEC9] opacity-75'
                  : isEnabled
                  ? 'bg-white border-[#0F523E] shadow-[4px_4px_0px_#0F523E]'
                  : 'bg-white border-[#0B1310]'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <h2 className="text-base font-extrabold text-[#0B1310] capitalize">
                      {scopeItem.scope.replace(/_/g, ' ')}
                    </h2>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-[2px] bg-[#F3F4F1] border border-[#C5CEC9] text-[#3F4E48]">
                      {scopeItem.who_sees_it}
                    </span>
                    {!isUsable && (
                      <span className="text-[10px] font-mono font-bold text-[#3F4E48] bg-[#E6EAE4] px-2 py-0.5 rounded-[2px] border border-[#0B1310]">
                        Not in this version
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#0B1310] mb-1.5 leading-relaxed">
                    <strong>Covers:</strong> {scopeItem.data_covered}
                  </p>
                  <p className="text-xs text-[#3F4E48] leading-relaxed">
                    <strong>Used for:</strong> {scopeItem.used_for}
                  </p>
                  {!isEnabled && isUsable && (
                    <p className="text-xs text-[#78350F] bg-[#FFFBEB] border border-[#B45309] p-2.5 rounded-[2px] mt-3 font-medium">
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
                    className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-[2px] border border-[#0B1310] transition-colors duration-200 ease-in-out ${
                      isEnabled ? 'bg-[#0F523E]' : 'bg-[#E6EAE4]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 m-0.5 transform rounded-[2px] bg-white border border-[#0B1310] transition duration-200 ease-in-out ${
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
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-5 border-t border-[#0B1310]">
        <button
          type="button"
          disabled={loading || loadingCopy || !consentCatalogue}
          onClick={() => void handleAgree()}
          className="w-full sm:flex-1 py-3.5 px-6 rounded-[2px] font-mono font-bold text-sm text-white bg-[#0F523E] hover:bg-[#093B2C] border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] btn-press cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? 'Recording Consent...' : 'Save Preferences & Continue →'}
        </button>

        <button
          type="button"
          disabled={loading || loadingCopy || !consentCatalogue}
          onClick={() => void handleDecline()}
          className="w-full sm:w-auto py-3.5 px-5 rounded-[2px] font-mono font-semibold text-xs text-[#0B1310] bg-white hover:bg-[#E6EAE4] border border-[#0B1310] btn-press cursor-pointer"
        >
          Decline (Education Only)
        </button>
      </div>
    </div>
  );
};
