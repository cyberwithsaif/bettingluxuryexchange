export default function Loading() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#0d1224",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ position: "relative", width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Faint background ring */}
        <svg style={{ position: "absolute", inset: 0 }} width="160" height="160" viewBox="0 0 160 160" fill="none">
          <circle cx="80" cy="80" r="74" stroke="rgba(245,166,35,0.15)" strokeWidth="6" fill="none" />
        </svg>

        {/* Spinning segmented ring */}
        <svg
          style={{ position: "absolute", inset: 0, animation: "spin 1.2s linear infinite" }}
          width="160" height="160" viewBox="0 0 160 160" fill="none"
        >
          <circle cx="80" cy="80" r="74" stroke="#f5a623" strokeWidth="6" strokeLinecap="round"
            strokeDasharray="80 385" strokeDashoffset="0" fill="none" />
          <circle cx="80" cy="80" r="74" stroke="#f5a623" strokeWidth="6" strokeLinecap="round"
            strokeDasharray="40 425" strokeDashoffset="-160" fill="none" opacity="0.6" />
          <circle cx="80" cy="80" r="74" stroke="#f5a623" strokeWidth="6" strokeLinecap="round"
            strokeDasharray="20 445" strokeDashoffset="-280" fill="none" opacity="0.3" />
        </svg>

        {/* Logo — full, no border-radius clipping */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Logo"
          width={110}
          height={110}
          style={{
            position: "relative",
            zIndex: 10,
            filter: "drop-shadow(0 0 14px rgba(245,166,35,0.5))",
            objectFit: "contain",
          }}
        />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
