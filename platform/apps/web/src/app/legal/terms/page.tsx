export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6 text-white/80">
      <h1 className="text-3xl font-display text-white">Terms &amp; Conditions</h1>
      <p className="text-white/50 text-sm">Last updated: May 2026</p>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">1. Eligibility</h2>
        <p>You must be at least 18 years of age to use this platform. By accessing or using our services, you confirm that you meet this requirement and that gambling is legal in your jurisdiction.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">2. Account Responsibility</h2>
        <p>You are responsible for maintaining the confidentiality of your account credentials. Any activity under your account is your responsibility. Notify us immediately of any unauthorized access.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">3. Deposits &amp; Withdrawals</h2>
        <p>All deposits are processed in INR. Withdrawal requests are subject to verification. We reserve the right to withhold funds pending identity verification or investigation of suspected fraud.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">4. Fair Play</h2>
        <p>Any attempt to exploit bugs, use automated bots, or collude with other players will result in immediate account suspension and forfeiture of funds.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">5. Limitation of Liability</h2>
        <p>We are not liable for any losses arising from the use of our platform, including technical failures, network issues, or market errors. Bets accepted in error may be voided.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">6. Changes to Terms</h2>
        <p>We reserve the right to update these terms at any time. Continued use of the platform following any changes constitutes acceptance of the revised terms.</p>
      </section>
    </div>
  );
}
