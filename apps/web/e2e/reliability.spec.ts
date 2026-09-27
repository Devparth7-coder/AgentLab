import { test, expect, type Page } from "@playwright/test";

async function unlock(page: Page) {
  await page.goto("/");
  await expect(
    page
      .getByPlaceholder("Enter access key")
      .or(
        page.getByRole("heading", { name: "Reliability, under a microscope." }),
      ),
  ).toBeVisible();
  if (
    await page
      .getByPlaceholder("Enter access key")
      .isVisible()
      .catch(() => false)
  ) {
    const key = process.env.WEB_ACCESS_KEY;
    if (!key)
      throw new Error("WEB_ACCESS_KEY required for authenticated E2E console");
    await page.getByPlaceholder("Enter access key").fill(key);
    await page.getByRole("button", { name: "Unlock AGENTLAB" }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Reliability, under a microscope." }),
  ).toBeVisible();
}

test("UI: register agent, create suite, run and inspect measured evidence", async ({
  page,
}) => {
  await unlock(page);
  const suffix = Date.now().toString().slice(-8);
  const agentName = `E2E Echo ${suffix}`;
  const benchmarkName = `E2E Suite ${suffix}`;
  await page.goto("/agents");
  await page.getByRole("button", { name: "Register agent" }).click();
  const dialog = page.locator(".fixed.inset-0.z-50");
  await dialog.getByPlaceholder("ResearchAgent").fill(agentName);
  await dialog.getByRole("button", { name: "Register agent" }).click();
  await expect(page.getByRole("link", { name: agentName })).toBeVisible();

  await page.goto("/benchmarks");
  await page.getByRole("button", { name: "Create benchmark" }).click();
  const composer = page.locator(".fixed.inset-0.z-50");
  await composer.getByPlaceholder("Research Agent / QA").fill(benchmarkName);
  await composer
    .getByPlaceholder("What should the agent accomplish?")
    .fill("hello e2e");
  await composer.getByPlaceholder('{"answer": 42}').fill("hello e2e");
  await composer.getByRole("button", { name: "Create benchmark" }).click();
  await expect(page.getByRole("link", { name: benchmarkName })).toBeVisible();
  await page.getByRole("link", { name: benchmarkName }).click();
  await page.getByRole("link", { name: "Run benchmark" }).click();
  await expect(
    page.getByRole("heading", { name: "Run an evaluation" }),
  ).toBeVisible();
  const agentOption = page
    .getByRole("combobox", { name: "Agent", exact: true })
    .locator("option")
    .filter({ hasText: agentName });
  await expect(agentOption).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Agent", exact: true })
    .selectOption({ value: (await agentOption.getAttribute("value"))! });
  await page.getByRole("button", { name: "Create & run evaluation" }).click();
  await expect(page.getByText("Evaluation progress")).toBeVisible();
  await expect(page.getByText("100%", { exact: true }).first()).toBeVisible({
    timeout: 40_000,
  });
  await page
    .getByRole("link", { name: "Open trace", exact: true })
    .first()
    .click();
  await expect(page.getByText("Observable timeline")).toBeVisible();
  await expect(
    page.getByText("FINAL RESPONSE", { exact: true }).first(),
  ).toBeVisible();
});

test("UI: 50-case synthetic regression, failure replay, trace and report", async ({
  page,
}) => {
  await unlock(page);
  await page.goto("/experiments");
  await page.getByRole("button", { name: "Run 50-case demo" }).click();
  await expect(page).toHaveURL(
    /\/experiments\/[a-f0-9]{32}\?baseline=[a-f0-9]{32}/,
  );
  const candidateId = new URL(page.url()).pathname.split("/").pop();
  await expect(
    page.getByRole("link", { name: "Compare versions" }),
  ).toBeVisible({ timeout: 70_000 });
  await page.getByRole("link", { name: "Compare versions" }).click();
  await page.getByRole("button", { name: "Compare versions" }).click();
  await expect(
    page.getByText("10 previously passing paired runs now fail"),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /Inspect failure/ })
    .first()
    .click();
  await expect(page.getByText("TOOL ARGUMENT FAILURE").first()).toBeVisible();
  await page.getByRole("button", { name: "Replay failure" }).click();
  await expect(page.getByText("REPRODUCIBLE", { exact: true })).toBeVisible({
    timeout: 40_000,
  });
  await page.getByRole("link", { name: "Open complete trace" }).click();
  await expect(page.getByText("ARGUMENT MISMATCH")).toBeVisible();
  await page.goto(`/experiments/${candidateId}`);
  await page.getByRole("button", { name: "Generate report" }).click();
  await expect(page).toHaveURL(/\/reports\/[a-f0-9]{32}/);
  await expect(
    page.getByRole("link", { name: "Structured JSON" }),
  ).toBeVisible();
  await expect(page.getByText("DEMO · SYNTHETIC")).toBeVisible();
});

test("UI: seeded robustness, N-run uncertainty, cost boundaries and PDF evidence", async ({
  page,
}) => {
  await unlock(page);
  await page.goto("/robustness");
  await expect(
    page.getByRole("heading", { name: "Break it deliberately." }),
  ).toBeVisible();
  const source = page.getByRole("combobox").first();
  const sourceOptions = await source.locator("option").allTextContents();
  const demoSource = sourceOptions.find((label) =>
    label.includes("DEMO · Revenue Analysis"),
  );
  expect(demoSource).toBeTruthy();
  await source.selectOption({ label: demoSource!.trim() });
  await page.locator('input[type="number"]').first().fill("2");
  await page.getByRole("button", { name: "Generate variant suite" }).click();
  await expect(page).toHaveURL(/\/benchmarks\/[a-f0-9]{32}$/);
  await expect(page.getByText("6 tasks", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Run benchmark" }).click();
  await expect(
    page.getByRole("heading", { name: "Run an evaluation" }),
  ).toBeVisible();
  const experimentName = `E2E robustness ${Date.now()}`;
  await page
    .getByRole("textbox", { name: "Experiment name" })
    .fill(experimentName);
  await page
    .getByRole("combobox")
    .first()
    .selectOption({ label: "DEMO · Dataset Research Agent (DEMO)" });
  await page
    .getByRole("combobox")
    .nth(1)
    .selectOption({ label: "v1.0.0 · deterministic-fixture" });
  await page.locator('input[type="number"]').first().fill("2");
  await expect(page.getByText("12 jobs will be queued")).toBeVisible();
  await page.getByRole("button", { name: "Create & run evaluation" }).click();
  await expect(page.getByText("12/12 runs")).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole("button", { name: "Metrics", exact: true }).click();
  await expect(page.getByText("PER-TASK / MULTI-RUN VARIANCE")).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Wilson 95% CI" }),
  ).toBeVisible();
  await expect(page.getByText("robustness_rate")).toBeVisible();
  // All 12 runs must be reflected in the final per-task table, not a stale
  // snapshot fetched before the last worker completed.
  await expect(
    page.getByRole("cell", { name: "2 / 2", exact: true }),
  ).toHaveCount(4);
  await expect(
    page.getByRole("cell", { name: "0 / 2", exact: true }),
  ).toHaveCount(2);
  const experimentId = new URL(page.url()).pathname.split("/").pop();

  await page.goto("/cost");
  const select = page.getByRole("combobox").first();
  const targetOption = select
    .locator("option")
    .filter({ hasText: experimentName });
  await expect(targetOption).toHaveCount(1);
  await select.selectOption({
    value: (await targetOption.getAttribute("value"))!,
  });
  await expect(
    page.getByText("WALL-CLOCK DISTRIBUTION", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Not measured", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "dataset.aggregate" }),
  ).toBeVisible();

  await page.goto(`/experiments/${experimentId}`);
  await page.getByRole("button", { name: "Generate report" }).click();
  await expect(page).toHaveURL(/\/reports\/[a-f0-9]{32}$/);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Evidence PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^agentlab-[a-f0-9]{32}\.pdf$/);
  await page.goto("/settings");
  await expect(page.getByText("Execution health")).toBeVisible();
  await expect(page.getByText("Queued runs")).toBeVisible();
});

test("UI BFF: unauthenticated proxy is denied and cross-origin mutations are rejected", async ({
  page,
}) => {
  const before = await page.request.get("/api/auth");
  const session = (await before.json()) as { authorized: boolean };
  if (!session.authorized) {
    const denied = await page.request.get("/api/proxy/agents");
    expect(denied.status()).toBe(401);
  }
  await unlock(page);
  const agents = await page.request.get("/api/proxy/agents");
  expect(agents.status()).toBe(200);
  const blocked = await page.request.post("/api/proxy/demo/seed", {
    headers: { Origin: "https://outside.example" },
    data: {},
  });
  expect(blocked.status()).toBe(403);
  const badOrigin = await page.request.post("/api/proxy/demo/seed", {
    headers: { Origin: "not-an-origin" },
    data: {},
  });
  expect(badOrigin.status()).toBe(403);
});
