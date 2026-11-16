// Site configuration. Everything here is public: no secrets belong in this file.
export const CONFIG = {
  // The tseriz API gateway. Its workers.dev address until tseriz.com/api/* is routed to it.
  apiBase: "https://tseriz-gateway.tsgen.workers.dev",
  // Cloudflare Turnstile site key (public) of the "tseriz" widget. It only works on the hostnames
  // that widget lists; for local testing use Cloudflare's always-pass test key, 1x00000000000000000000AA.
  turnstileSiteKey: "0x4AAAAAAGC_xVyaOdHI5jBH",
  // Where "create a free account" goes. The existing app keeps accounts until the new sign-in ships.
  signupUrl: "https://tseriz.com/accounts/signup/",
};
