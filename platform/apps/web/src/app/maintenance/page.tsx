export const dynamic = "force-dynamic";

export default function MaintenancePage() {
  return (
    <div style={{
      minHeight: "100dvh", background: "#0a0b16",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", color: "#fff", fontFamily: "sans-serif",
      padding: "24px", textAlign: "center",
    }}>
      <div style={{ fontSize: 80, marginBottom: 12 }}>🔧</div>
      <h1 style={{ fontSize: 30, fontWeight: 900, color: "#facc15", marginBottom: 10, letterSpacing: -0.5 }}>
        Under Maintenance
      </h1>
      <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", maxWidth: 400, lineHeight: 1.7, marginBottom: 0 }}>
        We&apos;re upgrading the platform for a better experience.
        We&apos;ll be back shortly — please check again in a few minutes.
      </p>
      <div style={{
        marginTop: 32, padding: "12px 28px", borderRadius: 14,
        background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.3)",
        color: "#facc15", fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
      }}>
        ⏱ Estimated downtime: a few minutes
      </div>
    </div>
  );
}
