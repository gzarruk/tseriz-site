// Site configuration. Everything here is public: no secrets belong in this file.
export const CONFIG = {
  // The tseriz API gateway. Until tseriz.com/api/* is routed to it, use its workers.dev address.
  apiBase: "https://tseriz.com",
  // Cloudflare Turnstile site key for this site's hostnames. This one is Cloudflare's published
  // always-pass test key; replace it with the real widget's site key before going live.
  turnstileSiteKey: "1x00000000000000000000AA",
  // Where "create a free account" goes. The existing app keeps accounts until the new sign-in ships.
  signupUrl: "https://tseriz.com/accounts/signup/",
};
