import { useEffect, useRef, useState } from 'react';
import { decodeIdToken, gisId, googleClientId, loadGis, type GoogleIdentity } from '../lib/googleAuth.ts';

// The optional "Continue with Google" button. Renders only when VITE_GOOGLE_CLIENT_ID is set and the
// GIS script loads; otherwise it renders nothing and the form behaves exactly as before. It does not
// authenticate the user — it only hands the decoded name/email up so the form can prefill.
export function GoogleContinue({ onIdentity }: { onIdentity: (id: GoogleIdentity) => void }) {
  const clientId = googleClientId();
  const btnRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Keep the latest callback without re-running the GIS setup effect.
  const cb = useRef(onIdentity);
  cb.current = onIdentity;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        const id = gisId();
        if (cancelled || !btnRef.current || !id) { if (!cancelled) setFailed(true); return; }
        id.initialize({
          client_id: clientId,
          callback: (resp) => {
            const identity = resp.credential ? decodeIdToken(resp.credential) : null;
            if (identity) cb.current(identity);
          },
        });
        id.renderButton(btnRef.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 320 });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [clientId]);

  if (!clientId || failed) return null;
  return (
    <div className="gsi">
      <div ref={btnRef} className="gsi__btn" />
      <div className="gsi__or"><span>or fill in the form</span></div>
    </div>
  );
}
