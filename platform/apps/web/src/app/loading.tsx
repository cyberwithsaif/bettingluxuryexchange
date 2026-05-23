export default function Loading() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#0d1224",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt=""
          style={{
            position: "relative", zIndex: 10, objectFit: "contain", display: "block",
            filter: "drop-shadow(0 0 16px rgba(255,100,0,0.5)) drop-shadow(0 0 40px rgba(255,200,0,0.2))",
            animation: "zoom 2.4s ease-in-out infinite",
            width: "clamp(140px, 100vw, 280px)",
            height: "auto",
          }}
        />
      </div>
      <style>{`
        @keyframes zoom {
          0% { transform: scale(0.6); }
          50% { transform: scale(1.1); }
          100% { transform: scale(0.6); }
        }
        @media (max-width: 640px) {
          img {
            width: 280px !important;
            height: 280px !important;
          }
        }
      `}</style>
    </div>
  );
}
