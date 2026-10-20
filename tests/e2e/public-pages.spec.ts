import { test, expect } from '@playwright/test';

test('landing_shows_two_real_services_with_committed_responsive_imagery', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Driver hiring', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shared journeys', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find a driver', exact: true })).toHaveAttribute(
    'href',
    '/drivers',
  );
  await expect(page.getByRole('link', { name: 'Find a carpool', exact: true })).toHaveAttribute(
    'href',
    '/carpools',
  );
  await expect(
    page.getByRole('link', { name: /rent a vehicle|reviews|notifications|reports/i }),
  ).toHaveCount(0);
  const images = page.locator('.service-summary img');
  await expect(images).toHaveCount(2);
  for (const img of await images.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveAttribute('alt', '');
    await expect(img).toHaveAttribute('width', '768');
    await expect(img).toHaveAttribute('height', '512');
    await expect(img).toHaveAttribute('srcset', /384w.*768w/);
    const src = await img.getAttribute('src');
    expect(src).toMatch(/^\/images\/generated\//);
    const response = await page.request.get(src!);
    expect(response.status()).toBe(200);
    expect((await response.body()).length).toBeLessThan(180_000);
    await expect
      .poll(() => img.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
      .toBe(true);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(
    page.getByText('Illustrations show service concepts, not actual providers or listings.'),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/phase07-landing-${info.project.name}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `artifacts/phase07-landing-320-${info.project.name}.png`,
    fullPage: true,
  });
});
