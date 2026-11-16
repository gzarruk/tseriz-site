// Pure helpers for the "Try it" page: building requests, sizing them, and shaping results.
// No DOM and no network here, so tests/lib.test.mjs can run them under Node.

export const DURATION_UNITS = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
// Most points drawn per trace; larger series are thinned with LTTB (the app's PREVIEW_MAX_POINTS).
export const PREVIEW_MAX_POINTS = 5000;
export const FAULTS = ["none", "gap", "spikes", "impact"];

/** A fresh form state: one channel with noise and an oscillation. */
export function defaultForm() {
  return {
    duration: 10,
    durationUnit: "minutes",
    samplingHz: 1,
    seed: "",
    channels: [defaultChannel(1)],
  };
}

export function defaultChannel(number) {
  return {
    name: `Sensor ${number}`,
    unit: "-",
    mean: 100,
    noise: 1,
    trendPerHour: 0,
    periodSeconds: 60,
    amplitude: 5,
    fault: "none",
  };
}

function durationSeconds(form) {
  return Number(form.duration) * DURATION_UNITS[form.durationUnit];
}

/** Total points across channels, as the engine counts them (rows include both ends). */
export function estimatePoints(form) {
  const rows = Math.floor(durationSeconds(form) * Number(form.samplingHz)) + 1;
  return rows * form.channels.length;
}

function faultFor(channel, seconds, samplingHz) {
  switch (channel.fault) {
    case "gap":
      return { removals: [{ mode: "percentage", percentage: 10, strategy: "gaps", num_gaps: 1 }] };
    case "spikes":
      return { outliers: [{ mode: "number", number: 5, value_mode: "factor", factor: 4, factor_sign: "both" }] };
    case "impact": {
      // A damped ring two thirds of the way in, at 20 samples per period so its peak is drawn faithfully.
      return {
        transients: [
          {
            onset_seconds: Math.round(seconds * 0.66 * 100) / 100,
            amplitude: Math.abs(channel.amplitude) * 4 || 10,
            natural_frequency_hz: samplingHz / 20,
            damping_ratio: 0.1,
          },
        ],
      };
    }
    default:
      return {};
  }
}

/** The `POST generations/` body for the form, in the API's multi-channel shape. */
export function buildRequest(form) {
  const seconds = durationSeconds(form);
  const samplingHz = Number(form.samplingHz);
  const channels = form.channels.map((channel) => {
    const out = {
      name: channel.name.trim() || "Sensor",
      unit: channel.unit.trim() || "-",
      mean: Number(channel.mean),
      noise_components: Number(channel.noise) > 0 ? [{ color: "white", amplitude: Number(channel.noise) }] : [],
      ...faultFor({ ...channel, amplitude: Number(channel.amplitude) }, seconds, samplingHz),
    };
    if (Number(channel.trendPerHour)) out.trend_slope = Number(channel.trendPerHour) / 3600 / samplingHz; // per sample
    if (Number(channel.amplitude) && Number(channel.periodSeconds) > 0) {
      out.oscillations = [{ period_seconds: Number(channel.periodSeconds), amplitude: Number(channel.amplitude), waveform: "sine" }];
    }
    return out;
  });
  const body = {
    config: { duration_seconds: seconds, sampling_frequency_hz: samplingHz, channels },
    destination: { type: "inline" },
  };
  if (String(form.seed).trim() !== "") body.seed = Number(form.seed);
  return body;
}

/** The generation's data as `[{name, values}]`, for both the single- and multi-channel payloads. */
export function seriesOf(data) {
  return data.channels ?? [{ name: "value", values: data.values }];
}

function csvField(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV with a timestamp column and one column per channel; missing values are empty cells. */
export function toCsv(data) {
  const series = seriesOf(data);
  const lines = [["timestamp", ...series.map((s) => s.name)].map(csvField).join(",")];
  data.timestamps.forEach((timestamp, row) => {
    lines.push([timestamp, ...series.map((s) => (s.values[row] ?? ""))].map(csvField).join(","));
  });
  return `${lines.join("\n")}\n`;
}

/**
 * Largest-Triangle-Three-Buckets: thin `values` to `threshold` points while keeping its shape.
 * Returns the kept indices. Missing values (null) are skipped, so gaps stay gaps.
 */
export function lttbIndices(values, threshold) {
  const present = [];
  values.forEach((v, i) => {
    if (v !== null && v !== undefined) present.push(i);
  });
  if (threshold >= present.length || threshold < 3) return present;
  const kept = [present[0]];
  const bucket = (present.length - 2) / (threshold - 2);
  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    const start = Math.floor(i * bucket) + 1;
    const end = Math.floor((i + 1) * bucket) + 1;
    const nextEnd = Math.min(Math.floor((i + 2) * bucket) + 1, present.length);
    let avgX = 0;
    let avgY = 0;
    for (let j = end; j < nextEnd; j++) {
      avgX += present[j];
      avgY += values[present[j]];
    }
    const count = Math.max(nextEnd - end, 1);
    avgX /= count;
    avgY /= count;
    let best = start;
    let bestArea = -1;
    const ax = present[a];
    const ay = values[ax];
    for (let j = start; j < end; j++) {
      const x = present[j];
      const area = Math.abs((ax - avgX) * (values[x] - ay) - (ax - x) * (avgY - ay));
      if (area > bestArea) {
        bestArea = area;
        best = j;
      }
    }
    kept.push(present[best]);
    a = best;
  }
  kept.push(present[present.length - 1]);
  return kept;
}

/**
 * Indices to draw for a preview of `values`: LTTB-thinned when longer than `threshold`, with `null`
 * wherever missing values were skipped, so the chart breaks the line instead of bridging a gap.
 */
export function previewIndices(values, threshold) {
  const kept = lttbIndices(values, threshold);
  const out = [];
  kept.forEach((index, i) => {
    if (i > 0 && index - kept[i - 1] > 1 && values.slice(kept[i - 1] + 1, index).some((v) => v === null || v === undefined)) {
      out.push(null);
    }
    out.push(index);
  });
  return out;
}

/** One message to show for an API refusal, whichever envelope it came in. */
export function errorMessage(status, body) {
  if (body && typeof body.error === "string") return body.error; // 402 quota envelope
  if (body && body.errors) {
    const flat = [];
    const walk = (node, path) => {
      if (Array.isArray(node)) node.forEach((item) => (typeof item === "string" ? flat.push(path ? `${path}: ${item}` : item) : walk(item, path)));
      else if (node && typeof node === "object") Object.entries(node).forEach(([key, child]) => walk(child, key === "__all__" ? path : path ? `${path}.${key}` : key));
    };
    walk(body.errors, "");
    if (flat.length) return flat.join(" ");
  }
  if (body && typeof body.detail === "string") return body.detail;
  return `The request failed (HTTP ${status}). Try again shortly.`;
}
