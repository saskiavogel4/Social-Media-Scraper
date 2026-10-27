// Email + password accounts (Supabase Auth, mocked in mockAuth.ts).
// The real Supabase project and the real /api/* functions are never called.
import {
  ACCESS_TOKEN,
  DEFAULT_PROFILE,
  TEST_USER,
  apiError,
  createProfileViaUi,
  expect,
  expectNoHorizontalScroll,
  signInViaUi,
  storedSession,
  test,
} from "./fixtures.ts";

const SEARCH_HEADING = "Find what's trending in your niche";
const NEW_EMAIL = "new.creator@example.com";
const NEW_PASSWORD = "a-good-long-password";

async function createAccountViaUi(page: import("@playwright/test").Page, email = NEW_EMAIL, password = NEW_PASSWORD) {
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}

test.describe("signed out", () => {
  test.use({ signedIn: false, seed: { profiles: [] } });

  test("wrong password shows an error; the right one opens profile setup and API calls carry the token", async ({ page, auth, api }) => {
    api.on("trending", () => ({ body: { videos: [], errors: [] } }));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "NextSocialPost" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeFocused();
    await expect(page.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Email")).toHaveAttribute("autocomplete", "email");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("autocomplete", "current-password");

    // Client-side checks first: nothing is sent for an empty form.
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Enter your email address.");
    expect(auth.callsTo("/token")).toHaveLength(0);

    await signInViaUi(page, TEST_USER.email, "not-my-password");
    await expect(page.getByRole("alert")).toHaveText("Wrong email or password.");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
    await expect(page.getByRole("heading", { name: SEARCH_HEADING })).toHaveCount(0);

    // Show/hide toggle.
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("peek");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");

    await signInViaUi(page);
    await createProfileViaUi(page, "Saskia");
    expect(auth.callsTo("/token").map((c) => c.body?.email)).toEqual([TEST_USER.email, TEST_USER.email]);
    expect(await storedSession(page)).toContain(ACCESS_TOKEN);

    await page.getByRole("button", { name: "Trending now" }).click();
    await expect.poll(() => api.callsTo("trending").map((c) => c.token)).toEqual([ACCESS_TOKEN]);
  });

  test("create account (email confirmation on) shows Check your inbox, resends, then signs in once confirmed", async ({ page, auth, baseURL }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Create account" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("autocomplete", "new-password");
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();

    // Too short: caught before contacting Supabase.
    await createAccountViaUi(page, NEW_EMAIL, "short");
    await expect(page.getByRole("alert")).toContainText("Use at least 8 characters.");
    expect(auth.callsTo("/signup")).toHaveLength(0);

    await createAccountViaUi(page);
    const panel = page.getByRole("region", { name: "Check your inbox" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Check your inbox" })).toBeFocused();
    await expect(panel).toContainText(`We sent a confirmation link to ${NEW_EMAIL}. Click it, then sign in.`);
    await expect(panel).toContainText("Didn't get it? Check spam, or wait a minute and try again.");
    const [signup] = auth.callsTo("/signup");
    expect(signup.body).toMatchObject({ email: NEW_EMAIL, password: NEW_PASSWORD });
    expect(signup.query.get("redirect_to")).toBe(new URL(baseURL!).origin);

    await panel.getByRole("button", { name: "Resend email" }).click();
    await expect(panel.getByRole("status")).toHaveText("Sent again. It can take a minute to arrive.");
    expect(auth.callsTo("/resend").map((c) => c.body)).toEqual([expect.objectContaining({ type: "signup", email: NEW_EMAIL })]);
    expect(auth.callsTo("/resend")[0].query.get("redirect_to")).toBe(new URL(baseURL!).origin);

    // Signing in before confirming explains why, and offers another email.
    await panel.getByRole("button", { name: "Back to sign in" }).click();
    await expect(page.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Email")).toHaveValue(NEW_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Please confirm your email first — check your inbox.");
    await alert.getByRole("button", { name: "Resend email" }).click();
    await expect(alert.getByRole("status")).toHaveText("Sent again. It can take a minute to arrive.");
    expect(auth.callsTo("/resend")).toHaveLength(2);

    auth.confirm(NEW_EMAIL);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create your profile" })).toBeVisible();
  });

  test("create account with an immediate session lands in profile setup", async ({ page, auth }) => {
    auth.signUpMode = "session";
    await page.goto("/");
    await createAccountViaUi(page);
    await expect(page.getByRole("heading", { name: "Create your profile" })).toBeVisible();
    expect(await storedSession(page)).toContain(NEW_EMAIL);
  });

  test("creating an account that already exists switches to Sign in", async ({ page, auth }) => {
    await page.goto("/");
    await createAccountViaUi(page, TEST_USER.email, "some-other-password");
    await expect(page.getByRole("status")).toHaveText("An account with this email already exists — sign in instead.");
    await expect(page.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Email")).toHaveValue(TEST_USER.email);
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
    expect(auth.callsTo("/signup")).toHaveLength(1);

    // Same outcome when "Confirm email" is off (Supabase answers 422 user_already_exists).
    auth.signUpMode = "session";
    await createAccountViaUi(page, TEST_USER.email, "some-other-password");
    await expect(page.getByRole("status")).toHaveText("An account with this email already exists — sign in instead.");
  });

  test("tabs work with the keyboard", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Sign in" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Create account" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "Create account" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Create account" })).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
  });

  test("a network failure gets a friendly message", async ({ page, auth }) => {
    auth.offline = true;
    await page.goto("/");
    await signInViaUi(page);
    await expect(page.getByRole("alert")).toHaveText("Couldn't reach the sign-in service. Check your connection.");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  });

  test("the email confirmation link signs the user in and cleans the URL", async ({ page, auth }) => {
    const now = Math.floor(Date.now() / 1000);
    const hash = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      expires_at: String(now + 3600),
      expires_in: "3600",
      refresh_token: "e2e-refresh-token",
      token_type: "bearer",
      type: "signup",
    });
    await page.goto(`/#${hash}`);
    await expect(page.getByRole("heading", { name: "Create your profile" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.href)).not.toContain("#");
    expect(page.url()).not.toContain("access_token");
    expect(auth.callsTo("/user")).toHaveLength(1);
    expect(await storedSession(page)).toContain(ACCESS_TOKEN);
  });

  test("an expired confirmation link explains what to do", async ({ page }) => {
    await page.goto("/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    await expect(page.getByRole("status")).toContainText("That confirmation link has expired or was already used.");
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
    expect(page.url()).not.toContain("error");
  });
});

test("sign out returns to the sign-in screen and clears the session", async ({ page, auth }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: SEARCH_HEADING })).toBeVisible();
  expect(await storedSession(page)).toContain(ACCESS_TOKEN);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();
  await expect.poll(() => storedSession(page)).toBeNull();
  await expect.poll(() => auth.callsTo("/logout").length).toBe(1);
  expect(auth.callsTo("/logout")[0].authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  expect(auth.callsTo("/logout")[0].query.get("scope")).toBe("local");
  await expect(page.getByText("Please sign in again")).toHaveCount(0);

  // Still signed out after a reload; profiles stay on this device.
  await page.reload();
  await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();
  await signInViaUi(page);
  await expect(page.getByRole("button", { name: `${DEFAULT_PROFILE.name}, profile menu` })).toBeVisible();
});

test("a later 401 from the API signs out with a note", async ({ page, api }) => {
  api.on("trending", () => apiError("unauthorized"));
  await page.goto("/");
  await page.getByRole("button", { name: "Trending now" }).click();
  const note = page.getByRole("status").filter({ hasText: "Please sign in again" });
  await expect(note).toContainText("Your session ended, so you were signed out.");
  await expect.poll(() => storedSession(page)).toBeNull();

  await signInViaUi(page);
  await expect(page.getByRole("heading", { name: SEARCH_HEADING })).toBeVisible();
});

test("removes the old shared password from storage", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("trendscout.password", "old-shared-password"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: SEARCH_HEADING })).toBeVisible();
  // The init script re-adds it before each load; the app removes it once it starts.
  await expect.poll(() => page.evaluate(() => localStorage.getItem("trendscout.password"))).toBeNull();
});

test.describe("auth screen at 360px", () => {
  test.use({ viewport: { width: 360, height: 780 }, signedIn: false, seed: { profiles: [] } });

  test("no horizontal scroll in either mode or the inbox panel", async ({ page }) => {
    const longEmail = `a.really.long.email.address.without.breaks.${"x".repeat(40)}@example-domain.com`;
    await page.goto("/");
    await expectNoHorizontalScroll(page, "sign in");
    await signInViaUi(page, TEST_USER.email, "wrong-password");
    await expect(page.getByRole("alert")).toBeVisible();
    await expectNoHorizontalScroll(page, "sign in with error");
    await page.getByRole("tab", { name: "Create account" }).click();
    await expectNoHorizontalScroll(page, "create account");
    await createAccountViaUi(page, longEmail);
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    await expectNoHorizontalScroll(page, "check your inbox");
  });
});
