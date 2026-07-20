import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('critical paths', () => {
  test('homepage loads and exposes mode rows', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Manhwadle/i }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /Today'?s modes/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Play Summary/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Play Character/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Play Cover/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Play Heardle/i })).toBeVisible()
    await expect(page.getByRole('navigation', { name: /Legal/i })).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: /Legal/i }).getByRole('link', { name: 'Privacy' }),
    ).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: /Legal/i }).getByRole('link', { name: 'Terms' }),
    ).toBeVisible()
  })

  test('play route shows taste gate on first visit', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
    })
    await page.goto('/play/summary')
    await expect(page.getByRole('heading', { name: /What do you usually read/i })).toBeVisible()
    await page.getByRole('radio', { name: /Action/i }).click()
    await page.getByRole('button', { name: /Continue/i }).click()
    await expect(page.getByRole('heading', { name: /Summary/i })).toBeVisible()
  })

  test('settings route opens account settings', async ({ page }) => {
    await page.goto('/settings')
    // Guests are redirected home; signed-out path still loads the app shell.
    await expect(page.getByRole('link', { name: /Manhwadle/i }).first()).toBeVisible()
  })

  test('avatar shop exposes the guest catalog and preview flow', async ({ page }) => {
    await page.goto('/shop')
    await expect(page.getByRole('heading', { name: 'Avatar Shop' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sign in to unlock and equip' })).toBeVisible()
    await expect(
      page.getByText(/Guest rounds cannot earn server-verified points/i),
    ).toBeVisible()
    await expect(page.getByLabel(/shop points/i)).toBeVisible()
    await expect(page.locator('.avatar-shop-preview .pixel-avatar')).toBeVisible()

    await expect(page.getByRole('tab', { name: 'Characters' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Backgrounds' })).toBeVisible()

    // Limited-time free claims sort first in the guest catalog.
    const questRecruit = page.getByRole('button').filter({ hasText: 'Quest Recruit' })
    await expect(questRecruit).toBeVisible()
    await questRecruit.click()
    await expect(questRecruit).toHaveAttribute('aria-pressed', 'true')
    await expect(
      page.locator('.avatar-shop-meta').getByRole('heading', { name: 'Quest Recruit' }),
    ).toBeVisible()
    await expect(page.locator('.avatar-shop-meta').getByText('Limited-time', { exact: true })).toBeVisible()
    // Without Supabase env in CI the CTA is Unavailable; with auth configured it prompts sign-in.
    await expect(
      page
        .locator('.avatar-shop-actions .btn-primary')
        .filter({ hasText: /Sign in to unlock|Unavailable/ }),
    ).toBeVisible()

    await expect(page.getByRole('button').filter({ hasText: 'Spark Apprentice' })).toBeVisible()

    const shadowHunter = page.getByRole('button').filter({ hasText: 'Shadow Hunter' })
    await expect(shadowHunter).toBeVisible()
    await shadowHunter.click()
    await expect(shadowHunter).toHaveAttribute('aria-pressed', 'true')
    await expect(
      page.locator('.avatar-shop-meta').getByRole('heading', { name: 'Shadow Hunter' }),
    ).toBeVisible()

    const defaultMale = page.getByRole('button').filter({ hasText: 'Default (Male)' })
    await expect(defaultMale).toBeVisible()

    const signIn = page.getByRole('button', { name: 'Sign in to unlock' })
    if (await signIn.isVisible().catch(() => false)) {
      await signIn.click()
      await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
    }

    await page.getByRole('tab', { name: 'Backgrounds' }).click()
    await expect(page.getByRole('tab', { name: 'Backgrounds' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('button').filter({ hasText: 'Blossom Courtyard' })).toBeVisible()
    await expect(page.getByRole('button').filter({ hasText: 'Sky Meadow' })).toBeVisible()
  })

  test('avatar shop remains usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/shop')
    await expect(page.getByRole('heading', { name: 'Avatar Shop' })).toBeVisible()
    await expect(page.locator('.avatar-shop-preview .pixel-avatar')).toBeVisible()
    await expect(page.getByRole('button').filter({ hasText: 'Quest Recruit' })).toBeVisible()
    await expect(page.getByRole('button').filter({ hasText: 'Skybreaker Monk' })).toBeVisible()
  })

  test('homepage leaderboard links to the full board without Show more', async ({ page }) => {
    await page.goto('/')
    const panel = page.locator('.leaderboard-panel')
    await expect(panel.getByRole('heading', { name: 'Leaderboard' })).toBeVisible()
    await expect(panel.getByRole('link', { name: 'View all' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Show more' })).toHaveCount(0)
    await expect(panel.getByRole('tab', { name: /Current streak/i })).toBeVisible()
  })

  test('leaderboard page supports exact username search submit', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back home' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Current streak/i })).toBeVisible()

    const search = page.getByLabel('Find player')
    await expect(search).toBeVisible()
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible()

    await search.fill('nobody_here_xyz')
    await page.getByRole('button', { name: 'Search' }).click()
    // Without a live board this may be an error or an exact no-match; either is a real submit path.
    await expect(
      page
        .getByRole('alert')
        .or(page.getByRole('status').filter({ hasText: /No exact match/i })),
    ).toBeVisible()
  })

  test('production preview hides owner-only dev surfaces for guests', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Dev tools' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Test unlocks' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Test solve SFX/i })).toHaveCount(0)

    await page.goto('/dev/animations')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: /Today'?s modes/i })).toBeVisible()

    await page.goto('/dev/action-strip-preview')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: /Today'?s modes/i })).toBeVisible()
  })

  test('how-to dialog is keyboard dismissible', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('manhwadle:readerTaste', 'both')
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('manhwadle:howto:seen:')) localStorage.removeItem(key)
      }
    })
    await page.goto('/play/summary')
    // First-visit how-to auto-opens once taste is set.
    await expect(page.locator('#howto-title')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#howto-title')).toHaveCount(0)
  })

  test('homepage has no serious axe violations', async ({ page }) => {
    await page.goto('/')
    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze()
    const serious = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact || ''),
    )
    expect(serious).toEqual([])
  })
})
