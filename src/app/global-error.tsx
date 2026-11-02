"use client";

/**
 * The last resort when the app itself fails to render (the board has its own
 * recovery, BoardErrorBoundary). It replaces the root layout, so it carries
 * its own page and plain inline styles. The way back in is safe mode, which
 * opens no plan.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const button = {
    padding: "6px 12px",
    borderRadius: 4,
    border: "1px solid #0e7490",
    background: "#0e7490",
    color: "white",
    cursor: "pointer",
    font: "inherit",
  } as const;
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#15171b", color: "#e5e5e5", font: "14px system-ui, sans-serif" }}>
        <div role="alert" style={{ maxWidth: 520, padding: 20, border: "1px solid #991b1b", borderRadius: 6, background: "#1f1416" }}>
          <h1 style={{ fontSize: 16, margin: "0 0 8px", color: "#fecaca" }}>GTNH Planner Retro ran into a problem.</h1>
          <p style={{ margin: "0 0 12px", color: "#d4d4d4" }}>
            Your plans are saved in this browser. Reload in safe mode to start without opening any plan, then open
            the one you want from the library.
          </p>
          {error?.message ? (
            <p style={{ margin: "0 0 16px", fontFamily: "monospace", fontSize: 12, color: "#737373", wordBreak: "break-word" }}>
              {error.message.slice(0, 300)}
            </p>
          ) : null}
          <button
            type="button"
            style={button}
            onClick={() => {
              window.location.href = `${window.location.origin}/#safe`;
              window.location.reload();
            }}
          >
            Reload in safe mode
          </button>
        </div>
      </body>
    </html>
  );
}
