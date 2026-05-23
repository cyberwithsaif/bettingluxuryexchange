export default function Loading() {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "#0d1224" }}
    >
      <div className="relative flex items-center justify-center">
        {/* Segmented spinner ring */}
        <svg
          className="absolute animate-spin"
          width="96"
          height="96"
          viewBox="0 0 96 96"
          fill="none"
          style={{ animationDuration: "1.4s" }}
        >
          {/* 8 arc segments, alternating visible/gap */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
            <circle
              key={deg}
              cx="48"
              cy="48"
              r="44"
              stroke={i % 2 === 0 ? "#f5a623" : "transparent"}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="22 278"
              strokeDashoffset={-((deg / 360) * 276.46)}
              fill="none"
            />
          ))}
        </svg>

        {/* Faint background ring */}
        <svg
          className="absolute"
          width="96"
          height="96"
          viewBox="0 0 96 96"
          fill="none"
        >
          <circle cx="48" cy="48" r="44" stroke="rgba(245,166,35,0.12)" strokeWidth="5" fill="none" />
        </svg>

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Logo"
          width={52}
          height={52}
          className="rounded-full relative z-10"
          style={{ display: "block" }}
        />
      </div>
    </div>
  );
}
