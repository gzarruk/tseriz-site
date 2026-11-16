// The "Try it" page: an Alpine.js component that sends the form or a preset to the tseriz API
// in anonymous mode and draws the result. Anonymous calls need a fresh Turnstile token each time.

import { CONFIG } from "./config.js";
import {
  FAULTS,
  PREVIEW_MAX_POINTS,
  buildRequest,
  defaultChannel,
  defaultForm,
  errorMessage,
  estimatePoints,
  previewIndices,
  seriesOf,
  toCsv,
} from "./lib.js";

const GENERATE_URL = `${CONFIG.apiBase}/api/v1/gen/generations/`;
const CAPABILITIES_URL = `${CONFIG.apiBase}/api/v1/gen/capabilities/`;
const CHART_COLORS = ["#5980a6", "#e8833a"];

function tryIt() {
  return {
    form: defaultForm(),
    faults: FAULTS,
    presets: [],
    limits: { max_inline_points: 10_000, max_channels: 2 },
    busy: false,
    error: "",
    result: null,
    title: "",
    turnstileId: null,
    turnstileWaiters: [],

    async init() {
      const [presets] = await Promise.all([
        fetch("data/presets.json").then((r) => r.json()),
        this.loadLimits(),
      ]);
      this.presets = presets;
      this.renderTurnstile();
    },

    async loadLimits() {
      try {
        const response = await fetch(CAPABILITIES_URL);
        if (response.ok) this.limits = (await response.json()).limits;
      } catch {
        // Keep the defaults; a refusal from the API will still explain any limit.
      }
    },

    get points() {
      return estimatePoints(this.form);
    },

    get overLimit() {
      return this.points > this.limits.max_inline_points;
    },

    presetFits(preset) {
      const channels = preset.request.config.channels.length;
      return channels <= this.limits.max_channels;
    },

    addChannel() {
      if (this.form.channels.length < this.limits.max_channels) {
        this.form.channels.push(defaultChannel(this.form.channels.length + 1));
      }
    },

    removeChannel(index) {
      this.form.channels.splice(index, 1);
    },

    // ── Turnstile ─────────────────────────────────────────────────────────

    renderTurnstile() {
      const render = () => {
        this.turnstileId = window.turnstile.render(this.$refs.turnstile, {
          sitekey: CONFIG.turnstileSiteKey,
          execution: "execute",
          appearance: "interaction-only",
          callback: (token) => this.turnstileWaiters.splice(0).forEach((w) => w.resolve(token)),
          "error-callback": () => {
            this.turnstileWaiters.splice(0).forEach((w) => w.reject(new Error("turnstile")));
          },
        });
      };
      if (window.turnstile) render();
      else window.addEventListener("turnstile-ready", render, { once: true });
    },

    /** A fresh single-use token: Turnstile tokens are valid for one verification only. */
    token() {
      return new Promise((resolve, reject) => {
        if (this.turnstileId === null) {
          reject(new Error("turnstile"));
          return;
        }
        this.turnstileWaiters.push({ resolve, reject });
        window.turnstile.reset(this.turnstileId);
        window.turnstile.execute(this.turnstileId);
      });
    },

    // ── Generating ────────────────────────────────────────────────────────

    generateForm() {
      return this.generate(buildRequest(this.form), "Your series");
    },

    generatePreset(preset) {
      return this.generate(preset.request, preset.chart_title);
    },

    async generate(body, title) {
      this.busy = true;
      this.error = "";
      try {
        let token;
        try {
          token = await this.token();
        } catch {
          this.error = "The bot check could not run. Reload the page and try again.";
          return;
        }
        const response = await fetch(GENERATE_URL, {
          method: "POST",
          headers: { "content-type": "application/json", "x-turnstile-token": token },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          this.error = errorMessage(response.status, payload);
          return;
        }
        this.result = payload;
        this.title = title;
        this.$nextTick(() => this.draw());
      } catch {
        this.error = "The tseriz API could not be reached. Try again shortly.";
      } finally {
        this.busy = false;
      }
    },

    draw() {
      const { data } = this.result;
      const traces = seriesOf(data).map((series, i) => {
        const kept = previewIndices(series.values, PREVIEW_MAX_POINTS);
        // A break is drawn as a missing value at the next point's time.
        const at = (k, i) => (k === null ? kept[i + 1] : k);
        return {
          type: "scattergl",
          mode: "lines",
          name: series.name,
          x: kept.map((k, i) => data.timestamps[at(k, i)]),
          y: kept.map((k) => (k === null ? null : series.values[k])),
          line: { width: 1.2, color: CHART_COLORS[i % CHART_COLORS.length] },
          connectgaps: false,
        };
      });
      window.Plotly.react(
        this.$refs.chart,
        traces,
        {
          margin: { l: 48, r: 16, t: 8, b: 40 },
          showlegend: traces.length > 1,
          legend: { orientation: "h", y: -0.2 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          font: { color: getComputedStyle(document.body).color },
          xaxis: { gridcolor: "rgba(128,128,128,0.2)" },
          yaxis: { gridcolor: "rgba(128,128,128,0.2)" },
        },
        { responsive: true, displaylogo: false },
      );
    },

    get summary() {
      if (!this.result) return "";
      const s = this.result.result_summary;
      return `${(s.num_points * s.num_channels).toLocaleString()} points · ${s.num_channels} channel${s.num_channels === 1 ? "" : "s"} · seed ${this.result.seed}`;
    },

    download() {
      const blob = new Blob([toCsv(this.result.data)], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `tseriz-${this.result.seed}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    },

    signupUrl: CONFIG.signupUrl,
  };
}

document.addEventListener("alpine:init", () => window.Alpine.data("tryIt", tryIt));
