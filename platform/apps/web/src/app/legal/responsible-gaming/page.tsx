export default function ResponsibleGamingPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6 text-white/80">
      <h1 className="text-3xl font-display text-white">Responsible Gaming</h1>

      <p className="text-lg text-white/70">
        We are committed to providing a safe and enjoyable gaming environment. Gambling should be fun — if it stops being fun, we want to help.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">Set Limits</h2>
        <p>Set daily, weekly, or monthly deposit and loss limits from your account settings to stay in control of your spending.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">Self-Exclusion</h2>
        <p>If you need a break, you can self-exclude your account for a period of your choosing. Contact support to activate a self-exclusion period.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">Warning Signs</h2>
        <ul className="list-disc list-inside space-y-1 text-white/60">
          <li>Spending more than you can afford to lose</li>
          <li>Chasing losses</li>
          <li>Gambling affecting your relationships or work</li>
          <li>Borrowing money to gamble</li>
          <li>Feeling anxious or irritable when not gambling</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">Get Help</h2>
        <p>If you or someone you know has a gambling problem, help is available. Reach out to our support team or seek assistance from a responsible gambling organization.</p>
      </section>

      <div className="bg-panel/40 border border-line rounded-lg p-4 text-sm text-white/60">
        🔞 You must be 18 or older to use this platform. Gambling is not a solution to financial difficulties.
      </div>
    </div>
  );
}
