// Run with `node --test` from the repository root. Covers the page's pure helpers; the page itself is checked by hand
// against a running gateway and engine (see README.md).

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { buildRequest, defaultForm, errorMessage, estimatePoints, lttbIndices, previewIndices, toCsv } from "../assets/lib.js";

test("the default form is a valid-looking single-channel request under the anonymous limit", () => {
  const form = defaultForm();
  assert.equal(estimatePoints(form), 601);
  const body = buildRequest(form);
  assert.deepEqual(body.destination, { type: "inline" });
  assert.equal(body.config.duration_seconds, 600);
  assert.equal(body.config.sampling_frequency_hz, 1);
  assert.equal(body.config.channels.length, 1);
  assert.deepEqual(body.config.channels[0].oscillations, [{ period_seconds: 60, amplitude: 5, waveform: "sine" }]);
  assert.equal("seed" in body, false);
});

test("points count every channel, as the engine meters them", () => {
  const form = defaultForm();
  form.channels.push({ ...form.channels[0], name: "Sensor 2" });
  assert.equal(estimatePoints(form), 1202);
});

test("trend is converted from per hour to the generator's per-sample slope", () => {
  const form = defaultForm();
  form.samplingHz = 2;
  form.channels[0].trendPerHour = 36;
  assert.equal(buildRequest(form).config.channels[0].trend_slope, 36 / 3600 / 2);
});

test("each fault maps to the generator component it names", () => {
  const form = defaultForm();
  const channel = (fault) => {
    form.channels[0].fault = fault;
    return buildRequest(form).config.channels[0];
  };
  assert.deepEqual(channel("gap").removals, [{ mode: "percentage", percentage: 10, strategy: "gaps", num_gaps: 1 }]);
  assert.equal(channel("spikes").outliers[0].value_mode, "factor");
  const impact = channel("impact").transients[0];
  assert.equal(impact.natural_frequency_hz, 1 / 20);
  assert.equal(impact.onset_seconds, 396);
  assert.equal(channel("none").removals, undefined);
});

test("a seed is sent only when one is given", () => {
  const form = defaultForm();
  form.seed = "42";
  assert.equal(buildRequest(form).seed, 42);
});

test("CSV has one column per channel and empty cells for missing values", () => {
  const csv = toCsv({
    timestamps: ["t0", "t1"],
    channels: [
      { name: "a", values: [1, null] },
      { name: "b, c", values: [2, 3] },
    ],
  });
  assert.equal(csv, 'timestamp,a,"b, c"\nt0,1,2\nt1,,3\n');
  assert.equal(toCsv({ timestamps: ["t0"], values: [5] }), "timestamp,value\nt0,5\n");
});

test("LTTB keeps the ends and a spike, skips gaps, and leaves short series alone", () => {
  const values = Array.from({ length: 1000 }, (_, i) => (i === 500 ? 100 : Math.sin(i / 10)));
  const kept = lttbIndices(values, 50);
  assert.equal(kept.length, 50);
  assert.equal(kept[0], 0);
  assert.equal(kept.at(-1), 999);
  assert.ok(kept.includes(500));
  assert.deepEqual(lttbIndices([1, null, 3], 5000), [0, 2]);
});

test("previews break the line where values are missing instead of bridging the gap", () => {
  const values = [1, 2, null, null, 5, 6];
  assert.deepEqual(previewIndices(values, 5000), [0, 1, null, 4, 5]);
  const long = Array.from({ length: 20000 }, (_, i) => (i >= 9000 && i < 10000 ? null : Math.sin(i / 50)));
  const kept = previewIndices(long, 5000);
  assert.equal(kept.filter((k) => k === null).length, 1);
  assert.ok(kept.filter((k) => k !== null).every((k) => long[k] !== null));
});

test("refusals read well in every envelope the API uses", () => {
  assert.equal(errorMessage(402, { error: "Over the limit.", error_type: "quota_error" }), "Over the limit.");
  assert.equal(errorMessage(429, { detail: "Slow down." }), "Slow down.");
  assert.equal(
    errorMessage(400, { detail: "Invalid generator config.", errors: { config: { channels: { 0: { mean: ["A number is required."] } } } } }),
    "config.channels.0.mean: A number is required.",
  );
  assert.equal(errorMessage(400, { detail: "x", errors: { __all__: ["At least one duration field is required"] } }), "At least one duration field is required");
  assert.match(errorMessage(502, null), /HTTP 502/);
});

test("every preset is an inline request with a thumbnail", () => {
  const presets = JSON.parse(readFileSync(new URL("../data/presets.json", import.meta.url)));
  assert.equal(presets.length, 6);
  for (const preset of presets) {
    assert.equal(preset.request.destination.type, "inline");
    assert.equal(preset.thumbnail.length, 80);
    assert.ok(preset.thumbnail.every((v) => v >= 0 && v <= 1));
  }
});
