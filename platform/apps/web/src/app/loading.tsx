export default function Loading() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#0d1224",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ position: "relative", width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>

        {/* Faint background ring */}
        <svg style={{ position: "absolute", inset: 0 }} width="200" height="200" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="92" stroke="rgba(245,166,35,0.12)" strokeWidth="6" fill="none" />
        </svg>

        {/* Outer slow ring */}
        <svg style={{ position: "absolute", inset: 0, animation: "spin-slow 3s linear infinite" }}
          width="200" height="200" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="92" stroke="#f5a623" strokeWidth="5" strokeLinecap="round"
            strokeDasharray="100 478" fill="none" />
          <circle cx="100" cy="100" r="92" stroke="#f5a623" strokeWidth="5" strokeLinecap="round"
            strokeDasharray="50 528" strokeDashoffset="-200" fill="none" opacity="0.5" />
          <circle cx="100" cy="100" r="92" stroke="#f5a623" strokeWidth="5" strokeLinecap="round"
            strokeDasharray="25 553" strokeDashoffset="-360" fill="none" opacity="0.25" />
        </svg>

        {/* Inner counter-rotating ring */}
        <svg style={{ position: "absolute", inset: "14px", animation: "spin-fast 1.6s linear infinite reverse" }}
          width="172" height="172" viewBox="0 0 172 172" fill="none">
          <circle cx="86" cy="86" r="80" stroke="rgba(245,166,35,0.25)" strokeWidth="3" strokeLinecap="round"
            strokeDasharray="40 462" fill="none" />
        </svg>

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Logo" width={140} height={140}
          style={{
            position: "relative", zIndex: 10,
            objectFit: "contain",
            filter: "drop-shadow(0 0 18px rgba(245,166,35,0.55)) drop-shadow(0 0 40px rgba(245,166,35,0.2))",
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes spin-slow { from { transform: rotate(0deg); }  to { transform: rotate(360deg); } }
        @keyframes spin-fast { from { transform: rotate(0deg); }  to { transform: rotate(360deg); } }
        @keyframes pulse     { 0%,100% { transform: scale(1); }   50% { transform: scale(1.04); } }
      `}</style>
    </div>
  );
}
