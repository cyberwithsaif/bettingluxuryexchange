export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6 text-white/80">
      <h1 className="text-3xl font-display text-white">Contact Us</h1>
      <p className="text-white/60">Have a question or need help? Reach out to our support team.</p>

      <div className="glass rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📧</span>
          <div>
            <p className="font-semibold text-white">Email Support</p>
            <p className="text-white/60 text-sm">support@future9.club</p>
            <p className="text-white/40 text-xs mt-0.5">Response within 24 hours</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-2xl">💬</span>
          <div>
            <p className="font-semibold text-white">Live Chat</p>
            <p className="text-white/60 text-sm">Available via the WhatsApp button on the site</p>
            <p className="text-white/40 text-xs mt-0.5">Mon–Sun, 9 AM – 11 PM IST</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-2xl">📢</span>
          <div>
            <p className="font-semibold text-white">Telegram</p>
            <p className="text-white/60 text-sm">@future9support</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-white/40">
        For account issues, please have your username and registered phone number ready.
      </p>
    </div>
  );
}
