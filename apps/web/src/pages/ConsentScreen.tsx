import { useEffect, useState } from 'react';
import { api, type ConsentCatalogue, type ConsentScope } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface ConsentScreenProps {
  caseId: string;
  onConsentComplete: (route: string) => void;
}

export const ConsentScreen: React.FC<ConsentScreenProps> = ({
  caseId,
  onConsentComplete
}) => {
  const [scopesConfig, setScopesConfig] = useState<ConsentScope[]>([]);
  const [consentCatalogue, setConsentCatalogue] = useState<ConsentCatalogue | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [loadingCopy, setLoadingCopy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([api.getCurrentConsent(), api.getCaseConsent(caseId)])
      .then(([catalogue, current]) => {
        if (!mounted) return;
        setConsentCatalogue(catalogue);
        setScopesConfig(catalogue.scopes);
        setSelectedScopes(Object.fromEntries(Object.entries(current.scopes).map(([key, value]) => [key, value.granted])));
      })
      .catch((err: Error) => {
        if (mounted) setError(err.message || 'Consent information is unavailable.');
      })
      .finally(() => { if (mounted) setLoadingCopy(false); });
    return () => { mounted = false; };
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
      if (!consentCatalogue) throw new Error('Consent information is unavailable. Reload this page after the API is available.');
      const result = await api.updateCaseConsent(caseId, consentCatalogue.consent_version, selectedScopes);
      let route = result.state?.route || (selectedScopes.assessment ? '/safety' : '/education');
      if (selectedScopes.assessment && result.state?.allowed_actions.includes('LOAD_PROFILE') && sessionStorage.getItem('sanad_case_start_mode') === 'SAMPLE') {
        const profileState = await api.applySampleProfile(caseId);
        route = profileState.route;
      }
      onConsentComplete(route);
    } catch (err: any) {
      setError(err.message || 'Failed to record consent');
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!consentCatalogue) throw new Error('Consent information is unavailable. Reload this page after the API is available.');
      await api.updateCaseConsent(caseId, consentCatalogue.consent_version, { assessment: false });
      onConsentComplete('/education');
    } catch (err: any) {
      setError(err.message || 'Failed to record refusal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <MockBadge label={`CONSENT COPY · ${consentCatalogue?.copy_status ?? 'MOCK'}`} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          How Your Health Information is Handled
        </h1>
        <p className="text-slate-600 text-sm sm:text-base mt-2 leading-relaxed">
          Choose which parts of this research prototype you agree to use. Optional permissions start off and can be left disabled.
        </p>
      </div>

      {loadingCopy && <p className="mb-6 text-sm text-slate-500">Loading consent choices…</p>}

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}

      {/* Scopes Ledger Cards */}
      <div className="space-y-4 mb-8">
        {scopesConfig.map((scopeItem) => {
          const isEnabled = !!selectedScopes[scopeItem.scope];
          const isUsable = scopeItem.used_in_this_flow !== false;

          return (
            <div
              key={scopeItem.scope}
              className={`p-5 rounded-xl border transition-all duration-150 ${
                !isUsable
                  ? 'bg-slate-50/60 border-slate-200 opacity-60'
                  : isEnabled
                  ? 'bg-white border-sky-300 shadow-xs ring-1 ring-sky-100'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-base font-bold text-slate-900 capitalize">
                      {scopeItem.scope.replace('_', ' ')}
                    </h2>
                    {!isUsable && (
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                        Not in this version
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mb-2 leading-relaxed">
                    <strong>Covers:</strong> {scopeItem.data_covered}
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    <strong>Used for:</strong> {scopeItem.used_for}
                  </p>
                  {!isEnabled && isUsable && (
                    <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded mt-2">
                      <strong>If disabled:</strong> {scopeItem.if_off}
                    </p>
                  )}
                </div>

                {isUsable && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${scopeItem.scope.replace('_', ' ')} consent`}
                    onClick={() => handleToggle(scopeItem.scope)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      isEnabled ? 'bg-sky-600' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        isEnabled ? 'translate-x-5' : 'translate-x-0'
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
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          disabled={loading || loadingCopy || !consentCatalogue}
          onClick={handleAgree}
          className="w-full sm:flex-1 py-3 px-5 rounded-xl font-semibold text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-all duration-150 btn-press cursor-pointer flex items-center justify-center gap-2"
        >
          {loading ? 'Recording...' : 'Save Preferences & Continue →'}
        </button>

        <button
          type="button"
          disabled={loading || loadingCopy || !consentCatalogue}
          onClick={handleDecline}
          className="w-full sm:w-auto py-3 px-5 rounded-xl font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors btn-press cursor-pointer text-sm"
        >
          Decline (Education Only)
        </button>
      </div>
    </div>
  );
};
