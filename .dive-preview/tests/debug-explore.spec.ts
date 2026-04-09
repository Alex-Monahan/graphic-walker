import { test, expect } from "@playwright/test";

test.setTimeout(180_000);
test.use({ storageState: "tests/.auth-state.json" });

const DIVE_URL =
  "https://app.motherduck.com/dive/17a0b9b8-4355-4c23-94f6-a34074809e4d";

async function collectLogs(page: any) {
  const logs: string[] = [];
  page.on("console", (msg: any) => {
    const text = `[${msg.type()}] ${msg.text()}`;
    logs.push(text);
    if (msg.type() === "error") console.log(text);
  });
  page.on("pageerror", (err: any) => {
    const text = `[PAGE ERROR] ${err.message}\n${err.stack}`;
    logs.push(text);
    console.log(text);
  });
  return logs;
}

test("debug: load Dive on MotherDuck and capture page state", async ({
  page,
}) => {
  const logs = await collectLogs(page);
  console.log(`Navigating to: ${DIVE_URL}`);
  await page.goto(DIVE_URL, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(10_000);

  const bodyText = await page.textContent("body");
  console.log("--- BODY TEXT (first 3000) ---");
  console.log(bodyText?.substring(0, 3000));
  console.log("--- URL ---");
  console.log(page.url());
  console.log(`--- LOGS (${logs.length}) ---`);
  for (const l of logs.slice(0, 50)) console.log(l);
});

test("debug: explore sample_data.who.ambient_air_quality on MotherDuck", async ({
  page,
}) => {
  const logs = await collectLogs(page);
  await page.goto(DIVE_URL, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(15_000);

  // Check if we can see the database picker
  const body = await page.textContent("body");
  console.log("--- Initial page (first 1000) ---");
  console.log(body?.substring(0, 1000));

  // Try to find and interact with the selects
  const dbSelect = page.locator('select[data-testid="db-select"]');
  const dbVisible = await dbSelect.isVisible().catch(() => false);
  console.log(`db-select visible: ${dbVisible}`);

  if (!dbVisible) {
    // Maybe the Dive renders inside an iframe
    const frames = page.frames();
    console.log(`Frames: ${frames.length}`);
    for (const frame of frames) {
      console.log(`  Frame: ${frame.url()}`);
      const frameBody = await frame.textContent("body").catch(() => "N/A");
      console.log(`  Body (500): ${frameBody?.substring(0, 500)}`);
      const frameDbSelect = frame.locator('select[data-testid="db-select"]');
      const vis = await frameDbSelect.isVisible().catch(() => false);
      console.log(`  db-select in frame: ${vis}`);
    }
  }

  if (dbVisible) {
    await dbSelect.selectOption("sample_data");
    await page.waitForTimeout(5_000);
    const tableSelect = page.locator('select[data-testid="table-select"]');
    await tableSelect.selectOption("who.ambient_air_quality");
    await page.locator('[data-testid="explore-btn"]').click();
    await page.waitForTimeout(15_000);

    const afterBody = await page.textContent("body");
    console.log("--- After explore (first 2000) ---");
    console.log(afterBody?.substring(0, 2000));
  }

  console.log(`--- ALL ERRORS (${logs.filter((l) => l.includes("error") || l.includes("Error")).length}) ---`);
  for (const l of logs) {
    if (l.includes("error") || l.includes("Error") || l.includes("PAGE ERROR"))
      console.log(l);
  }
});

test("debug: explore tpcds_sf1_share.customer on MotherDuck", async ({
  page,
}) => {
  const logs = await collectLogs(page);
  await page.goto(DIVE_URL, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(15_000);

  const dbSelect = page.locator('select[data-testid="db-select"]');
  const dbVisible = await dbSelect.isVisible().catch(() => false);

  if (!dbVisible) {
    // Check iframes
    for (const frame of page.frames()) {
      const vis = await frame
        .locator('select[data-testid="db-select"]')
        .isVisible()
        .catch(() => false);
      if (vis) {
        console.log(`Found db-select in frame: ${frame.url()}`);
        await frame
          .locator('select[data-testid="db-select"]')
          .selectOption("tpcds_sf1_share");
        await frame.waitForTimeout(5_000);
        const tableSelect = frame.locator('select[data-testid="table-select"]');
        const opts = await tableSelect
          .locator("option")
          .allTextContents()
          .catch(() => []);
        console.log(`Tables: ${opts.join(", ")}`);

        const custOpt = opts.find((t: string) =>
          t.toLowerCase().includes("customer")
        );
        if (custOpt) {
          const val = custOpt.includes(".") ? custOpt : `main.${custOpt}`;
          console.log(`Selecting: ${val}`);
          await tableSelect.selectOption(val);
          await frame.locator('[data-testid="explore-btn"]').click();
          await frame.waitForTimeout(15_000);
          const afterBody = await frame.textContent("body");
          console.log("--- After explore (first 2000) ---");
          console.log(afterBody?.substring(0, 2000));
        }
        break;
      }
    }
  } else {
    await dbSelect.selectOption("tpcds_sf1_share");
    await page.waitForTimeout(5_000);
    const tableSelect = page.locator('select[data-testid="table-select"]');
    const opts = await tableSelect.locator("option").allTextContents();
    console.log(`Tables: ${opts.join(", ")}`);

    const custOpt = opts.find((t: string) =>
      t.toLowerCase().includes("customer")
    );
    if (custOpt) {
      const val = custOpt.includes(".") ? custOpt : `main.${custOpt}`;
      console.log(`Selecting: ${val}`);
      await tableSelect.selectOption(val);
      await page.locator('[data-testid="explore-btn"]').click();
      await page.waitForTimeout(15_000);
      const afterBody = await page.textContent("body");
      console.log("--- After explore (first 2000) ---");
      console.log(afterBody?.substring(0, 2000));
    }
  }

  console.log(`--- ALL ERRORS ---`);
  for (const l of logs) {
    if (l.includes("error") || l.includes("Error") || l.includes("PAGE ERROR"))
      console.log(l);
  }
});
