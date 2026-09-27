// Record real AGENTLAB browser actions against a disposable, seeded backend.
// Usage: AGENTLAB_WEB_URL=http://127.0.0.1:3001 WEB_ACCESS_KEY=<test-only key> node apps/web/scripts/record-action.mjs
// Never record a production account or unredacted private benchmark content.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.AGENTLAB_WEB_URL ?? "http://127.0.0.1:3001";
const accessKey = process.env.WEB_ACCESS_KEY;
if (!accessKey || accessKey.length < 32)
  throw new Error("A disposable WEB_ACCESS_KEY (32+ characters) is required");
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const capture =
  process.env.AGENTLAB_CAPTURE_DIR ??
  path.join(project, ".data/action-capture");
await fs.mkdir(capture, { recursive: true });
await fs.mkdir(path.join(capture, "stills"), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
  acceptDownloads: true,
  recordVideo: { dir: capture, size: { width: 1600, height: 900 } },
});
const auth = await context.request.post(`${base}/api/auth`, {
  data: { accessKey },
});
if (!auth.ok())
  throw new Error(`Pre-recording test session rejected: HTTP ${auth.status()}`);

// The cursor overlay mirrors actual Playwright mouse movements; it cannot click anything.
await context.addInitScript(() => {
  window.addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;z-index:2147483647;left:-50px;top:-50px;width:22px;height:22px;" +
      "border:2px solid #a7ffe0;background:rgba(66,207,160,.22);border-radius:50%;" +
      "box-shadow:0 0 0 5px rgba(91,231,177,.10),0 0 19px rgba(74,225,162,.35);" +
      "pointer-events:none;transform:translate(-50%,-50%);transition:background .12s,box-shadow .12s";
    document.body.append(dot);
    window.addEventListener("mousemove", (event) => {
      dot.style.left = `${event.clientX}px`;
      dot.style.top = `${event.clientY}px`;
    });
    window.addEventListener("mousedown", () => {
      dot.style.background = "rgba(137,255,187,.75)";
      dot.style.boxShadow = "0 0 0 13px rgba(91,231,177,.18)";
    });
    window.addEventListener("mouseup", () => {
      dot.style.background = "rgba(66,207,160,.22)";
      dot.style.boxShadow = "0 0 0 5px rgba(91,231,177,.10)";
    });
  });
});

const page = await context.newPage();
const video = page.video();
const start = performance.now();
const chapters = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function mark(title, description) {
  const at = Number(((performance.now() - start) / 1000).toFixed(2));
  chapters.push({ at, title, description });
  console.log(`${at.toFixed(1)}s  ${title} · ${description}`);
}
async function still(name) {
  await page.screenshot({ path: path.join(capture, "stills", `${name}.png`) });
}
async function click(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 13,
    });
    await pause(180);
  }
  await locator.click();
}
async function getJson(route) {
  const response = await context.request.get(`${base}/api/proxy${route}`);
  if (!response.ok())
    throw new Error(
      `Evidence request ${route} returned HTTP ${response.status()}`,
    );
  return response.json();
}
let success = false;
try {
  page.on("pageerror", (e) => console.error("Browser page error:", e.message));
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "Reliability, under a microscope." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /No evaluations yet/ }),
  ).toBeVisible();
  mark("01 / HONEST BASELINE", "Empty until an evaluation really runs.");
  await still("01-honest-baseline");
  await pause(3000);

  mark("02 / EXECUTE DEMO", "100 deterministic mock jobs; no seeded scores.");
  await click(page.getByRole("button", { name: "Run controlled demo" }));
  await expect(page).toHaveURL(
    /\/experiments\/[a-f0-9]{32}\?baseline=[a-f0-9]{32}$/,
  );
  const candidateId = new URL(page.url()).pathname.split("/").pop();
  const baselineId = new URL(page.url()).searchParams.get("baseline");
  await expect(page.getByText("Evaluation progress")).toBeVisible();
  await still("02-queued-run");
  await pause(1200);
  await expect(
    page.getByRole("link", { name: "Compare versions" }),
  ).toBeVisible({ timeout: 90_000 });
  const baseline = await getJson(`/experiments/${baselineId}`);
  const candidate = await getJson(`/experiments/${candidateId}`);
  if (
    baseline.progress.counts.PASSED !== 50 ||
    candidate.progress.counts.PASSED !== 40 ||
    candidate.progress.total !== 50 ||
    !candidate.is_demo
  )
    throw new Error(
      "Unexpected executed demo counts; never record an unverified claim",
    );
  mark(
    "03 / MEASURED RESULTS",
    "Baseline 50/50; candidate 40/50. Mock fixture only.",
  );
  await still("03-measured-results");
  await pause(2500);
  await click(page.getByRole("button", { name: "Metrics", exact: true }));
  await expect(page.getByText("task_success_rate")).toBeVisible();
  mark(
    "04 / EVIDENCE & FORMULAS",
    "Each metric carries its source, denominator and measurement time.",
  );
  await still("04-metric-provenance");
  await pause(2200);

  await click(page.getByRole("link", { name: "Compare versions" }));
  await expect(
    page.getByRole("heading", { name: "Regression laboratory" }),
  ).toBeVisible();
  await click(page.getByRole("button", { name: "Compare versions" }));
  await expect(
    page.getByText("10 previously passing paired runs now fail"),
  ).toBeVisible();
  mark(
    "05 / PAIRED REGRESSION",
    "Ten newly failing task/run pairs; matched benchmark and seed.",
  );
  await still("05-paired-regression");
  await pause(3100);
  await page.mouse.wheel(0, 515);
  await pause(1100);
  await still("05-paired-metrics");
  await pause(1000);

  const failureLink = page
    .getByRole("link", { name: /Inspect failure/ })
    .first();
  await click(failureLink);
  await expect(
    page.getByText("ROOT-CAUSE SIGNAL / CLASSIFIED FROM EVALUATION EVIDENCE"),
  ).toBeVisible();
  mark(
    "06 / FAILURE FORENSICS",
    "Reference, observed output, and evaluator evidence side by side.",
  );
  await still("06-failure-record");
  await pause(2200);
  await click(page.getByRole("button", { name: "Replay failure" }));
  await expect(page.getByText("REPRODUCIBLE", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await page
    .getByText("REPRODUCIBLE", { exact: true })
    .scrollIntoViewIfNeeded();
  mark("07 / REPLAY", "A separate mock run reproduces the recorded failure.");
  await still("07-reproducible-replay");
  await pause(2200);

  await click(page.getByRole("link", { name: "Open complete trace" }));
  await expect(page.getByText("Observable timeline")).toBeVisible();
  await expect(page.getByText("ARGUMENT MISMATCH")).toBeVisible();
  mark(
    "08 / OBSERVABLE TRACE",
    "Tool arguments and sandbox responses. No private chain-of-thought.",
  );
  await still("08-trace");
  await pause(3400);

  await click(page.getByRole("link", { name: "Robustness", exact: true }));
  await expect(
    page.getByRole("heading", { name: "Break it deliberately." }),
  ).toBeVisible();
  mark(
    "09 / ROBUSTNESS DESIGN",
    "Seeded perturbations preserve or separate the task meaning.",
  );
  await page.locator("#robust-limit").fill("2");
  await still("09-robustness-design");
  await pause(2100);
  await click(page.getByRole("button", { name: "Generate variant suite" }));
  await expect(page).toHaveURL(/\/benchmarks\/[a-f0-9]{32}$/);
  await expect(page.getByText("6 tasks", { exact: true })).toBeVisible();
  await still("09-generated-suite");
  await pause(1400);

  await click(page.getByRole("link", { name: "Run benchmark" }));
  await expect(
    page.getByRole("heading", { name: "Run an evaluation" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Experiment name" })
    .fill("DEMO · Robustness probe · two runs per case");
  await page
    .getByRole("combobox", { name: "Pinned agent version" })
    .selectOption({ label: "v1.0.0 · deterministic-fixture" });
  await page.getByRole("spinbutton", { name: /Runs per task/ }).fill("2");
  await expect(page.getByText("12 jobs will be queued")).toBeVisible();
  mark(
    "10 / REPEATED EVALUATION",
    "Six task variants × two executions, with immutable configuration.",
  );
  await still("10-repeated-evaluation-form");
  await pause(1600);
  await click(page.getByRole("button", { name: "Create & run evaluation" }));
  await expect(page.getByText("12/12 runs")).toBeVisible({ timeout: 70_000 });
  const robustnessId = new URL(page.url()).pathname.split("/").pop();
  await click(page.getByRole("button", { name: "Metrics", exact: true }));
  await page
    .getByText("PER-TASK / MULTI-RUN VARIANCE")
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("columnheader", { name: "Wilson 95% CI" }),
  ).toBeVisible();
  const finalDistribution = await getJson(
    `/experiments/${robustnessId}/task-distribution`,
  );
  if (finalDistribution.tasks.reduce((sum, task) => sum + task.n, 0) !== 12)
    throw new Error("Per-task API observations do not cover all twelve runs");
  await expect(
    page.getByRole("cell", { name: "2 / 2", exact: true }),
  ).toHaveCount(4);
  await expect(
    page.getByRole("cell", { name: "0 / 2", exact: true }),
  ).toHaveCount(2);
  mark(
    "11 / UNCERTAINTY",
    "Observed per-task variance and Wilson intervals, not a safety guarantee.",
  );
  await still("11-per-task-uncertainty");
  await pause(2700);

  await click(page.getByRole("link", { name: "Cost & latency", exact: true }));
  const costSelect = page.getByRole("combobox").first();
  await expect(
    costSelect.locator(`option[value="${robustnessId}"]`),
  ).toHaveCount(1);
  await costSelect.selectOption(robustnessId);
  await expect(page.getByText("12 recorded runs")).toBeVisible();
  mark(
    "12 / HONEST ECONOMICS",
    "Latency observed; mock token usage and cost are Not measured.",
  );
  await still("12-cost-coverage");
  await pause(3400);

  await page.goto(`${base}/experiments/${candidateId}`);
  await expect(
    page.getByRole("button", { name: "Generate report" }),
  ).toBeVisible();
  mark(
    "13 / FROZEN REPORT",
    "Capture the candidate's measured evidence and limitations.",
  );
  await click(page.getByRole("button", { name: "Generate report" }));
  await expect(page).toHaveURL(/\/reports\/[a-f0-9]{32}$/);
  await expect(page.getByRole("link", { name: "Evidence PDF" })).toBeVisible();
  const reportId = new URL(page.url()).pathname.split("/").pop();
  const report = await getJson(`/reports/${reportId}`);
  if (
    report.content_json.demo !== true ||
    report.content_json.experiment?.id !== candidateId
  )
    throw new Error("Report does not preserve verified DEMO provenance");
  await still("13-report-and-exports");
  await pause(3000);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    click(page.getByRole("link", { name: "Evidence PDF" })),
  ]);
  const pdfPath = path.join(capture, "captured-evidence.pdf");
  await download.saveAs(pdfPath);
  const pdf = await fs.readFile(pdfPath);
  if (pdf.subarray(0, 5).toString() !== "%PDF-")
    throw new Error("Exported file was not a PDF");
  mark(
    "14 / PDF EXPORTED",
    "A real report snapshot, with immutable source IDs and DEMO label.",
  );
  await pause(1400);

  await click(page.getByRole("link", { name: "Overview", exact: true }));
  await expect(
    page.getByRole("heading", { name: "Reliability, under a microscope." }),
  ).toBeVisible();
  await still("15-live-overview");
  mark(
    "15 / RESEARCH LOOP",
    "Test. Observe. Break. Improve. Only executed mock measurements.",
  );
  await pause(3200);
  const evidence = {
    baseline_experiment_id: baselineId,
    candidate_experiment_id: candidateId,
    robustness_experiment_id: robustnessId,
    report_id: reportId,
    pdf_bytes: pdf.length,
  };
  await fs.writeFile(
    path.join(capture, "verified-evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  success = true;
} catch (error) {
  console.error("Capture interrupted:", error);
  await still("capture-error").catch(() => {});
} finally {
  await page.close();
  await context.close();
  await browser.close();
  const videoPath = await video.path();
  await fs.copyFile(videoPath, path.join(capture, "website-actions.webm"));
  await fs.writeFile(
    path.join(capture, "chapters.json"),
    JSON.stringify(chapters, null, 2),
  );
  console.log(
    `Raw screen recording: ${path.join(capture, "website-actions.webm")}`,
  );
}
if (!success) process.exitCode = 1;
