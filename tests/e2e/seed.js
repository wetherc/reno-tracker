// Creates a project and its schedule items through the API, so a spec
// can start from a known project without clicking through the forms.
// The other specs start from an empty database, so a seeded project is
// deleted at the end of its test.

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {{ name: string, startDate: string, budgetCents?: number }} project
 * @param {{ title: string, startDate: string, endDate: string, estimatedCents?: number, responsibleParty?: string }[]} items
 * @returns {Promise<{ id: string, items: { id: string, title: string }[] }>}
 */
export async function seedProject(request, project, items) {
  const created = await (
    await request.post('/api/projects', {
      data: { budgetCents: 0, ...project },
    })
  ).json();
  const rows = [];
  for (const item of items) {
    const response = await request.post(
      `/api/projects/${created.id}/schedule`,
      { data: { estimatedCents: 0, ...item } },
    );
    rows.push(await response.json());
  }
  return { id: created.id, items: rows };
}

/**
 * Opens the page on one project by name.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export async function openProject(page, name) {
  await page.goto('/');
  await page
    .getByLabel('Project', { exact: true })
    .selectOption({ label: name });
  await page
    .getByRole('heading', { level: 1 })
    .and(page.locator('.panel__title'))
    .waitFor();
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} id
 */
export async function dropProject(request, id) {
  await request.delete(`/api/projects/${id}`);
}
