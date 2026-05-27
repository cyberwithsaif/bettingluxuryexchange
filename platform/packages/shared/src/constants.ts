// Currency precision — store money as integer minor units in DB (paisa/cents),
// but the API surface uses major-unit decimals. This constant marks the precision.
export const MONEY_DECIMALS = 2;

// Default platform limits — admin-configurable per-user via UserLimits
export const DEFAULT_LIMITS = {
  minStake: 100,         // ₹100 minimum bet
  maxStake: 100_000,     // ₹1,00,000 maximum bet
  maxMarketExposure: 1_000_000,
  maxDailyLoss: 500_000,
};

// Provider catalogue — used to seed admin API-key CRUD form options.
// Each entry maps to one row the admin can configure in the api_keys table.
export const API_KEY_PROVIDERS = [
  // Sports
  { key: "betfair_exchange",   label: "Betfair Exchange",     category: "sports" as const, fields: ["app_key", "session_token", "cert_path"] },
  { key: "betfair_stream",     label: "Betfair Stream",       category: "sports" as const, fields: ["app_key", "session_token"] },
  { key: "pinnacle",           label: "Pinnacle API",         category: "sports" as const, fields: ["username", "password"] },
  { key: "the_odds_api",       label: "The Odds API",         category: "sports" as const, fields: ["api_key"] },
  { key: "cricket_api",        label: "Cricket API (cricapi)", category: "sports" as const, fields: ["api_key"] },
  { key: "betsapi",            label: "BetsAPI (b365api)",    category: "sports" as const, fields: ["api_token"] },
  { key: "entitysport",        label: "EntitySport Cricket",  category: "sports" as const, fields: ["api_token"] },
  // Casino aggregators
  { key: "slotslaunch",        label: "SlotsLaunch (free demo slots)", category: "casino" as const, fields: ["token", "host"] },
  // Casino live
  { key: "evolution",          label: "Evolution Gaming",     category: "casino" as const, fields: ["agent_id", "secret", "callback_token"] },
  { key: "pragmatic_play",     label: "Pragmatic Play",       category: "casino" as const, fields: ["api_url", "secret", "operator_id"] },
  { key: "vivo_gaming",        label: "Vivo Gaming",          category: "casino" as const, fields: ["operator_id", "secret"] },
  { key: "ezugi",              label: "Ezugi",                category: "casino" as const, fields: ["operator_id", "secret"] },
  { key: "sa_gaming",          label: "SA Gaming",            category: "casino" as const, fields: ["agent_id", "secret"] },
  { key: "playtech",           label: "Playtech",             category: "casino" as const, fields: ["client_id", "secret"] },
  { key: "mac88",              label: "Mac88",                category: "casino" as const, fields: ["operator_id", "secret"] },
  // Crash / instant
  { key: "spribe",             label: "Spribe (Aviator)",     category: "crash"  as const, fields: ["operator_key", "secret"] },
  { key: "smartsoft",          label: "SmartSoft",            category: "crash"  as const, fields: ["api_key", "secret"] },
  { key: "turbo_gaming",       label: "Turbo Gaming",         category: "crash"  as const, fields: ["operator_id", "secret"] },
  { key: "jili",               label: "Jili",                 category: "slots"  as const, fields: ["agent_id", "secret"] },
  // Lottery / virtual
  { key: "tvbet",              label: "TVBet",                category: "virtual" as const, fields: ["operator_id", "secret"] },
  { key: "betgames",           label: "BetGames",             category: "virtual" as const, fields: ["operator_id", "secret"] },
  // Payments
  { key: "razorpay",           label: "Razorpay (UPI/Bank)",  category: "payment" as const, fields: ["key_id", "key_secret", "webhook_secret"] },
  { key: "cashfree",           label: "Cashfree",             category: "payment" as const, fields: ["app_id", "secret_key"] },
  { key: "crypto_wallet",      label: "Crypto Wallet Gateway", category: "payment" as const, fields: ["api_key", "secret", "webhook_secret"] },
] as const;

export type ApiKeyProviderKey = typeof API_KEY_PROVIDERS[number]["key"];
