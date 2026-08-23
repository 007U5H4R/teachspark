import { useEffect, useRef, useState } from 'react';
import './PhoneDemo.css';

/**
 * The onboarding walkthrough video inside a CSS iPhone frame. The video is already the phone's
 * screen recording (cropped to the portrait content), so the frame + island just dress it up.
 */
export function PhoneDemo({ autoPlay = false }: { autoPlay?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  // Respect reduced-motion: never start an autoplaying loop for someone who asked motion to stop.
  // They still get the poster and the controls to play it deliberately.
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  // Sampling the preference once at mount is not enough: a visitor who turns Reduce Motion on
  // while this page is open would otherwise be left with a looping video — the exact thing the
  // setting asks to stop. Pause on the transition as well as blocking a fresh autoplay.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => {
      setReduced(e.matches);
      if (e.matches) ref.current?.pause();
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // React does not reliably set the muted DOM *property* from the attribute, and muted is what
  // lets autoplay start on mobile — so pin it imperatively.
  useEffect(() => {
    if (ref.current) ref.current.muted = true;
  }, []);

  return (
    <div className="phone">
      <div className="phone__frame">
        <span className="phone__island" aria-hidden="true" />
        <video
          ref={ref}
          className="phone__screen"
          src="/demo-v2.mp4"
          poster="/demo-poster.jpg"
          controls
          loop
          muted
          playsInline
          autoPlay={autoPlay && !reduced}
          preload="metadata"
          aria-label="TeachSpark onboarding walkthrough — sign up, connect on WhatsApp, make your first worksheet"
        />
      </div>
    </div>
  );
}
