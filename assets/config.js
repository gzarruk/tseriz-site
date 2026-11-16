// Site configuration. Everything here is public: no secrets belong in this file.
export const CONFIG = {
  // The tseriz API gateway. Until tseriz.com/api/* is routed to it, use its workers.dev address.
  apiBase: "https://tseriz.com",
  // Cloudflare Turnstile site key (public) of the "tseriz" widget. It only works on the hostnames
  // that widget lists; for local testing use Cloudflare's always-pass test key, 1x00000000000000000000AA.
  turnstileSiteKey: "0x4AAAAAAGC_xVyaOdHI5jBH",
  // Where "create a free account" goes. The existing app keeps accounts until the new sign-in ships.
  signupUrl: "https://tseriz.com/accounts/signup/",
};
