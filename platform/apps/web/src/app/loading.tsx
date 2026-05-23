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
          width={280}
          height={280}
          style={{
            width: "min(280px, 75vw)",
            height: "min(280px, 75vw)",
            objectFit: "contain",
            display: "block",
            filter: "drop-shadow(0 0 16px rgba(255,100,0,0.5)) drop-shadow(0 0 40px rgba(255,200,0,0.2))",
            animation: "ld-zoom 2.4s ease-in-out infinite",
          }}
        />
      </div>
      <style>{`
        @keyframes ld-zoom {
          0%   { transform: scale(0.6); }
          50%  { transform: scale(1.1); }
          100% { transform: scale(0.6); }
        }
      `}</style>
    </div>
  );
}
