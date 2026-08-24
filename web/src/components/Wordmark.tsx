// The two-tone TeachSpark logo: "Teach" in the body text colour, "Spark" in brand green, set in the
// rounded Baloo 2 face. Rendered as one component so the nav, the footer, and anywhere else the mark
// appears stay identical — the OG cover mirrors the same treatment in scripts/brand-assets.ts.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`wordmark${className ? ` ${className}` : ''}`}>
      Teach<span className="wordmark__spark">Spark</span>
    </span>
  );
}
