import { test, expect } from '@playwright/test';

test('320px_forms_have_labels_no_overflow_and_reduced_motion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/login', '/register', '/forgot-password', '/drivers', '/carpools']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      route,
    ).toBe(true);
    await expect
      .poll(
        async () =>
          page
            .locator('main input:not([type=hidden]),main select,main textarea')
            .evaluateAll((nodes) =>
              nodes
                .filter(
                  (node) =>
                    !(node as HTMLInputElement).labels?.length && !node.getAttribute('aria-label'),
                )
                .map((node) => `${node.tagName}#${node.id}`),
            ),
        { message: `${route} form controls have associated labels` },
      )
      .toEqual([]);
    expect(
      await page.locator('main').evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('none');
  }
});

test('keyboard_skip_link_and_route_heading_focus', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Skip to content' }).focus();
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.getByRole('link', { name: 'Create account', exact: true }).click();
  await expect(page.locator('h1')).toBeFocused();
});

test('service_failure_preserves_login_input_and_focuses_recovery', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('recovery@example.com');
  await page.getByLabel('Password', { exact: true }).fill('CorrectHorseRecovery1!');
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Temporarily unavailable. Try again.' },
      }),
    }),
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('Email address')).toHaveValue('recovery@example.com');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('CorrectHorseRecovery1!');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});

test('contrast_AA_for_text_and_control_boundaries', async ({ page }) => {
  for (const route of ['/login', '/register', '/drivers', '/carpools']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    const failures = await page.locator('main').evaluate((main) => {
      const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      const luminance = (color: string) =>
        rgb(color)
          .slice(0, 3)
          .map((value) => {
            const s = value / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i]!, 0);
      const ratio = (a: string, b: string) => {
        const x = luminance(a),
          y = luminance(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const background = (node: Element): string => {
        const value = getComputedStyle(node).backgroundColor;
        const channels = rgb(value);
        return channels.length < 4 || channels[3] !== 0
          ? value
          : node.parentElement
            ? background(node.parentElement)
            : 'rgb(248,248,242)';
      };
      const problems: string[] = [];
      for (const node of main.querySelectorAll(
        'h1,h2,p,label,a,button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)',
      )) {
        const style = getComputedStyle(node);
        if (!(node as HTMLElement).offsetParent || style.visibility === 'hidden') continue;
        const threshold =
          parseFloat(style.fontSize) >= 24 ||
          (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700)
            ? 3
            : 4.5;
        if (ratio(style.color, background(node)) < threshold - 0.01)
          problems.push(`${node.tagName} text contrast`);
        if (
          node.matches('input,select,textarea') &&
          ratio(style.borderTopColor, background(node)) < 3 - 0.01
        )
          problems.push(`${node.tagName} boundary contrast`);
      }
      return problems;
    });
    expect(failures, route).toEqual([]);
  }
});
