export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6 text-white/80">
      <h1 className="text-3xl font-display text-white">Privacy Policy</h1>
      <p className="text-white/50 text-sm">Last updated: May 2026</p>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">1. Information We Collect</h2>
        <p>We collect information you provide during registration (name, email, phone), transaction data (deposits, withdrawals, bets), and technical data (IP address, device type, browser) for security and analytics purposes.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">2. How We Use Your Information</h2>
        <p>Your data is used to operate and improve our services, process transactions, prevent fraud, comply with legal obligations, and communicate with you about your account.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">3. Data Sharing</h2>
        <p>We do not sell your personal data. We may share data with payment processors, fraud prevention services, and regulatory authorities as required by law.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">4. Data Retention</h2>
        <p>We retain your data for as long as your account is active and for a period thereafter as required by applicable laws and regulations.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">5. Security</h2>
        <p>We implement industry-standard security measures including encrypted connections (HTTPS), hashed passwords, and access controls to protect your data.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">6. Your Rights</h2>
        <p>You may request access to, correction of, or deletion of your personal data by contacting our support team.</p>
      </section>
    </div>
  );
}
