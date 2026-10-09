# Enable welcome email (Microsoft 365 / Outlook SMTP)

Your app already sends the welcome email after signup **when SMTP login succeeds**. If mail does not arrive, the server is rejecting login (`535 Authentication unsuccessful`) or blocking SMTP.

## 1. Turn on SMTP AUTH for this mailbox (required)

As **Microsoft 365 admin**:

1. Open **Microsoft 365 admin center** → **Users** → **Active users**.
2. Open the user **recruitment.application@metaforgeit.com** (or your recruiting mailbox).
3. Open the **Mail** tab → **Manage email apps** (or **Email apps** / **Manage** depending on layout).
4. Turn **Authenticated SMTP** **On** (sometimes labeled **SMTP AUTH**).
5. Save and wait a few minutes.

**Alternative (Exchange admin / PowerShell):**

- **Exchange admin center** → **Recipients** → **Mailboxes** → select the mailbox → **Mailbox** tab → **Manage email apps settings** → enable **Authenticated SMTP**.

Or for the whole tenant (less ideal):  
[Enable or disable SMTP AUTH](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission) — use PowerShell `Set-TransportConfig` / per-mailbox cmdlets as in Microsoft docs.

## 2. Use the correct password in `.env`

In `backend/.env`:

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=recruitment.application@metaforgeit.com
SMTP_PASS=put_the_real_password_here
FROM_EMAIL=recruitment.application@metaforgeit.com
SMTP_FROM_NAME=MetaForge Recruitment
```

- **SMTP_USER** must be the **same** account you sign in with in Outlook on the web.
- **SMTP_PASS** must be that account’s password **unless** the account uses **MFA** (see below).

## 3. If multi-factor authentication (MFA) is enabled

Normal account passwords often **do not** work for SMTP. Create an **app password**:

1. Sign in to Microsoft account security / Microsoft 365 security info.
2. Create a new **App password** (name it e.g. `Recruiter SMTP`).
3. Put **only that app password** in `SMTP_PASS` in `.env` (not your normal password).

## 4. Test from your PC (no guessing)

From the `backend` folder:

```bash
npm run mail:test
```

If that passes, SMTP is working. To also send one real test message:

```bash
npm run mail:test -- your.personal@email.com
```

Check **Inbox** and **Junk email**.

For verbose SMTP logs:

```env
SMTP_DEBUG=true
```

Then restart the API and run `npm run mail:test` again.

## 5. Still failing?

- Sign in to **https://outlook.office.com** with **recruitment.application@metaforgeit.com** — if login fails, fix the password first.
- Ask your tenant admin whether **security defaults** or **Conditional Access** block **legacy authentication** / SMTP for this user.
- Long term, Microsoft may require **OAuth2** for SMTP in some tenants; that is a larger change than `.env` credentials.

---

After SMTP works, **restart the backend** and sign up a test user — the welcome email uses the same settings.

## 6. Graph API `403` / `ErrorAccessDenied` on sendMail

Graph **authentication can succeed** (the app gets an access token) while **`POST /users/{from}/sendMail` returns 403** `ErrorAccessDenied`. That almost always means the app does **not** have effective permission to send mail **as that mailbox**, or **admin consent was not applied** after permissions were added.

Official API: [sendMail](https://learn.microsoft.com/graph/api/user-sendmail).  
Delegated permissions do **not** apply to **client credentials** — you need **Application** permissions.

### 6a) Re-check API permissions (most important)

1. Open [Microsoft Entra admin center](https://entra.microsoft.com) → **Identity** → **Applications** → **App registrations** → select your mail app (e.g. **Metaforge-MailSenderx**).
2. **API permissions**.
3. Under **Microsoft Graph** → **Application permissions**, confirm **`Mail.Send`** is listed.
4. Check the **Status** column for each permission:
   - It must show **Granted for \<YourTenant\>** (or equivalent).
   - If it shows **Not granted for …**: click **Grant admin consent for \<tenant\>** again, confirm, wait **1–3 minutes**.
5. Restart the backend, then from `backend` run:

   ```bash
   npm run mail:test -- your-email@example.com
   ```

### 6b) If still 403: add `User.Read.All` (optional)

Some tenants behave better if the app can read directory objects. As **Application permission**:

1. **Add a permission** → **Microsoft Graph** → **Application permissions** → add **`User.Read.All`**.
2. **Grant admin consent** again.
3. Wait 1–3 minutes, restart backend, re-test.

`Mail.Send` remains the permission that actually sends mail; `User.Read.All` is a troubleshooting add-on when 403 persists after consent is clearly granted.

### 6d) Thread reply (`createReplyAll`) needs **Mail.ReadWrite**

Replying in the **original client email thread** uses:

`POST /users/{mailbox}/messages/{id}/createReplyAll`

That requires Microsoft Graph **Application** permission **`Mail.ReadWrite`** (not just `Mail.Send`), plus **admin consent**.

1. Entra → App registrations → your app → **API permissions** → **Add permission** → Microsoft Graph → **Application permissions**.
2. Add **`Mail.ReadWrite`** (and keep **`Mail.Send`**).
3. **Grant admin consent** for the tenant.
4. Restart the backend and run:

   ```bash
   npx tsx scripts/test-graph-thread-reply.ts "your original email subject"
   ```

If `createReplyAll` returns **403 ErrorAccessDenied**, the app will try **Graph sendMail** with `In-Reply-To` headers (needs **`Mail.Send`**). SMTP is used only when **`MAIL_GRAPH_FALLBACK_SMTP=true`** and SMTP credentials work.

### 6e) Sending from the correct mailbox

This app builds:

`POST https://graph.microsoft.com/v1.0/users/{sender}/sendMail`

where `{sender}` is from env, in order:

1. `GRAPH_FROM_EMAIL`
2. else `FROM_EMAIL`
3. else `SMTP_USER`

In `backend/.env`, set **`GRAPH_FROM_EMAIL`** (and/or `FROM_EMAIL`) to the **exact** mailbox UPN that exists in your tenant and is allowed to send (e.g. `recruitment.application@metaforgeit.com`). It must match the account your admins expect the app to impersonate.

### 6f) Workaround without Graph

- Set `MAIL_PROVIDER=smtp`, enable **Authenticated SMTP** on that mailbox, and use `SMTP_*` (sections 1–4 above).
- Or set `MAIL_GRAPH_FALLBACK_SMTP=true` **only** when SMTP is verified (`npm run mail:test`) so a Graph 403 can retry via SMTP.
