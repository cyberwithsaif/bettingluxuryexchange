export default function Loading() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#0d1224",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ position: "relative", width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg style={{ position: "absolute", inset: 0 }} width="200" height="200" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="92" stroke="rgba(255,255,255,0.06)" strokeWidth="6" fill="none" />
        </svg>
        <svg style={{ position: "absolute", inset: 0, animation: "spin 2s linear infinite" }}
          width="200" height="200" viewBox="0 0 200 200" fill="none">
          <defs>
            <linearGradient id="arc-grad2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffcc00" />
              <stop offset="50%" stopColor="#ff6a00" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="92" stroke="url(#arc-grad2)" strokeWidth="6" strokeLinecap="round"
            strokeDasharray="140 438" fill="none" />
          <circle cx="100" cy="100" r="92" stroke="#ef4444" strokeWidth="6" strokeLinecap="round"
            strokeDasharray="60 518" strokeDashoffset="-145" fill="none" opacity="0.35" />
          <circle cx="100" cy="100" r="92" stroke="#ffcc00" strokeWidth="6" strokeLinecap="round"
            strokeDasharray="20 558" strokeDashoffset="-210" fill="none" opacity="0.15" />
        </svg>
        <svg style={{ position: "absolute", inset: "16px", animation: "spin-r 1.6s linear infinite" }}
          width="168" height="168" viewBox="0 0 168 168" fill="none">
          <circle cx="84" cy="84" r="78" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray="35 455" fill="none" opacity="0.3" />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={140} height={140}
          style={{ position: "relative", zIndex: 10, objectFit: "contain", display: "block",
            filter: "drop-shadow(0 0 16px rgba(255,100,0,0.5)) drop-shadow(0 0 40px rgba(255,200,0,0.2))",
            animation: "pulse 2.2s ease-in-out infinite" }}
        />
      </div>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes spin-r { to { transform: rotate(-360deg); } }
        @keyframes pulse  { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      `}</style>
    </div>
  );
}
