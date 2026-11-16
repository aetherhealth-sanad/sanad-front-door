import { useEffect, useRef, useState } from 'react';
import { api, type OcrLabDraft, type OcrLabField } from '../api/client';

const MAX_BYTES = 5 * 1024 * 1024;

interface Props {
  caseId: string;
  onUseField: (value: { testCode: string; numericValue: number; unit: string; collectionDate: string }) => void;
}

const labelOf = (name: string) => name.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

export const OcrLabReview: React.FC<Props> = ({ caseId, onUseField }) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(0); // prevent stale OCR results appearing beside a newer file preview
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<OcrLabDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Browser-only preview: not persisted to sessionStorage, IndexedDB, or localStorage.
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const clear = () => {
    requestId.current += 1;
    setBusy(false);
    setDraft(null);
    setSelectedFile(null);
    if (fileInput.current) fileInput.current.value = '';
    setError(null);
  };

  const read = async () => {
    if (!selectedFile) return;
    if (selectedFile.size > MAX_BYTES) {
      setError('Maximum size is 5 MB.');
      return;
    }
    const thisRequest = ++requestId.current;
    setBusy(true);
    setError(null);
    setDraft(null);
    try {
      const result = await api.readLabReport(caseId, selectedFile);
      if (thisRequest === requestId.current) setDraft(result);
    } catch (e) {
      if (thisRequest === requestId.current) {
        setError(e instanceof Error ? e.message : 'Could not read the synthetic report.');
      }
    } finally {
      if (thisRequest === requestId.current) setBusy(false);
    }
  };

  const dateField = draft?.fields.find(field => field.field_id === 'collection_date');
  const dateValid = !!dateField && typeof dateField.value === 'string'
    && dateField.flags.length === 0 && dateField.status === 'UNCONFIRMED';

  const canPrefill = (field: OcrLabField): field is OcrLabField & { value: number; unit: string; target_test_code: string } =>
    dateValid && field.flags.length === 0 && field.status === 'UNCONFIRMED'
    && typeof field.value === 'number' && Number.isFinite(field.value)
    && field.unit !== null && field.target_test_code !== null;

  return (
    <section className="medical-card bg-[#FBFAF6] border border-[#C8D6CC] p-5 sm:p-6 rounded-2xl space-y-4" aria-label="Synthetic lab OCR review">
      <div>
        <h2 className="font-bold text-[#1A1F1C]">Read a synthetic lab report (OCR prototype)</h2>
        <p className="text-xs text-[#575C55] mt-1">
          Only reports marked SYNTHETIC / SYN- are supported. PDF, PNG, JPEG up to 5 MB.
          The file is read in memory; no observation is created from OCR alone.
          Never upload real patient data.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          aria-label="Select synthetic lab report"
          onChange={event => {
            requestId.current += 1;
            setBusy(false);
            setSelectedFile(event.target.files?.[0] ?? null);
            setDraft(null);
            setError(null);
          }}
          className="text-xs max-w-full"
        />
        <button type="button" disabled={!selectedFile || busy} onClick={() => void read()}
          className="btn-pill-primary rounded-full px-4 py-2 text-xs font-bold disabled:opacity-50">
          {busy ? 'Reading locally...' : 'Read report'}
        </button>
        <button type="button" onClick={clear}
          className="btn-pill-secondary rounded-full px-4 py-2 text-xs font-bold">
          Clear preview
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-[#8F1D17]">{error}</p>}
      {draft?.status === 'REJECTED' && (
        <p role="alert" className="text-xs text-[#8F1D17]">
          Report rejected: {draft.reason}. A local OCR engine may be needed for scanned pages.
        </p>
      )}
      {draft?.status === 'EXTRACTED' && (
        <div className="space-y-4">
          <p className="text-xs text-[#575C55]">
            {draft.fields.length} fields read · {draft.ocr_engine ?? 'PDF text layer'} · Every field is unconfirmed.
            Select one clean value at a time to prefill the manual form, then save and separately confirm it.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2 max-h-96 overflow-auto" aria-label="OCR extracted fields">
              {draft.fields.map(field => (
                <div key={field.field_id} className="rounded-xl border border-[#E4DFD3] p-3 space-y-1.5">
                  <div className="text-xs font-bold">{labelOf(field.field_id)}</div>
                  <div className="text-sm text-[#1A1F1C] break-words">
                    {field.value ?? 'Not readable'} {field.unit ?? ''}
                  </div>
                  <div className="text-xs text-[#575C55] break-words">Printed: {field.raw_text ?? 'not found'}</div>
                  {field.bbox && <div className="text-xs text-[#575C55]">
                    Source page {field.bbox.page}, position ({field.bbox.x}, {field.bbox.y})
                  </div>}
                  <div className="text-xs text-[#575C55]">
                    {field.status} · OCR score {field.scores.ocr.toFixed(2)}
                  </div>
                  {field.flags.length > 0 && <div className="text-xs text-[#B54708] font-semibold">
                    Review required: {field.flags.join(', ')}
                  </div>}
                  {field.target_test_code && (
                    <button
                      type="button"
                      disabled={!canPrefill(field)}
                      onClick={() => {
                        if (canPrefill(field) && typeof dateField?.value === 'string') {
                          onUseField({
                            testCode: field.target_test_code,
                            numericValue: field.value,
                            unit: field.unit,
                            collectionDate: dateField.value,
                          });
                        }
                      }}
                      className="rounded-full border border-[#1F4D3F] text-[#163A2F] px-3 py-1.5 text-xs font-bold disabled:opacity-40"
                    >
                      Prefill manual entry
                    </button>
                  )}
                  {!field.target_test_code && <p className="text-xs text-[#575C55]">
                    Read only: no approved target test code in the current lab catalogue.
                  </p>}
                </div>
              ))}
            </div>
            {previewUrl && (
              <div className="rounded-xl border border-[#E4DFD3] overflow-hidden bg-[#F7F5EF]">
                {selectedFile?.type === 'application/pdf' || selectedFile?.name.toLowerCase().endsWith('.pdf') ? (
                  <iframe title="Local synthetic report preview" src={previewUrl} className="w-full h-96" />
                ) : (
                  <img src={previewUrl} alt="Local synthetic report preview" className="w-full max-h-96 object-contain" />
                )}
                <p className="p-2 text-xs text-[#575C55]">Preview stays in this browser session. Bounding-box overlay is not yet implemented.</p>
              </div>
            )}
          </div>
          {!dateValid && <p className="text-xs text-[#B54708]" role="status">
            Collection date is missing or ambiguous: enter it manually before saving any observation.
          </p>}
        </div>
      )}
    </section>
  );
};
