# Token Setup Checklist (Facebook & Instagram)

Use this checklist to generate valid tokens for publishing and analysis.

## Facebook Page Token
- Ensure you are an **Admin/Editor/Moderator** on page `FACEBOOK_PAGE_ID`.
- If the business requires it, enable **Two-Factor Authentication (2FA)** on your Facebook account.
- In your Facebook App:
  - Add permissions: `pages_manage_posts`, `pages_read_engagement`.
  - Go through **App Review** or use in **Development** with your test users.
- Generate a **User Access Token** and exchange for a **Page Access Token** via:
  - `GET /{user-id}/accounts` with your user token → pick the page → use its `access_token`.
- Place the page token in `.env.local` as `FACEBOOK_ACCESS_TOKEN`.

## Instagram Graph Token
- Confirm the Instagram account is a **Business** account and is connected to the Facebook Page.
- In the Facebook App:
  - Add permission: `instagram_basic` (and `pages_show_list` if needed).
- Generate a **User Access Token**, then ensure IG endpoints work for your business:
  - Verify `INSTAGRAM_BUSINESS_ID` is correct.
  - Test `GET /{ig-business-id}?fields=username,id` with the token.
- For longer sessions, exchange for a **Long-Lived Token** using Graph API.
- Place the token in `.env.local` as `INSTAGRAM_ACCESS_TOKEN`.

## Validation
- Visit `/health/env` for configuration keys.
- Visit `/health/credentials` for read-only connectivity (no posting).
- In the UI, look for the badges: Facebook and Instagram should show **ok** (green).

## Notes
- If `/health/credentials` shows 190 errors: token is invalid/expired.
- If it shows subcode 492: user lacks required page role or needs 2FA.
- Keep `.env.local` private; it’s ignored by git.
