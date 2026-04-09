import { test, expect } from "@playwright/test";

test("debug: list databases and tables", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") return;
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => logs.push(`[PAGE ERROR] ${err.message}`));

  await page.goto("/");
  // Wait for db-select to appear
  await expect(page.getByTestId("db-select")).toBeVisible({ timeout: 60_000 });

  // Get all option values
  const dbOptions = await page.getByTestId("db-select").locator("option").allTextContents();
  console.log("--- DATABASES ---");
  console.log(dbOptions.join("\n"));

  // Try sample_data
  if (dbOptions.includes("sample_data")) {
    await page.getByTestId("db-select").selectOption("sample_data");
    await expect(page.getByTestId("table-select")).toBeEnabled({ timeout: 30_000 });
    const tableOptions = await page.getByTestId("table-select").locator("option").allTextContents();
    console.log("--- SAMPLE_DATA TABLES ---");
    console.log(tableOptions.join("\n"));
  }

  // Try my_db
  if (dbOptions.includes("my_db")) {
    await page.getByTestId("db-select").selectOption("my_db");
    await page.waitForTimeout(3000);
    const tableOptions = await page.getByTestId("table-select").locator("option").allTextContents();
    console.log("--- MY_DB TABLES ---");
    console.log(tableOptions.join("\n"));
  }
});
