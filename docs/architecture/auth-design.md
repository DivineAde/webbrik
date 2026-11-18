# Authentication and authorization

- Passwords: scrypt (N default, 16-byte salt) with constant-time compare (`auth.service.ts`).
- Sessions: opaque 256-bit random tokens; only the SHA-256 hash is stored; httpOnly, Secure, SameSite=Lax cookie; rotation on privilege change; revoke on logout.
- Email verification & reset: single-use, hashed, expiring tokens (model: `Invite`-style; endpoints pending).
- OAuth: `OAuthAccount(provider, providerId)`; MFA: `User.mfaSecret` (TOTP) optional.
- Authorization: role → permission sets in `packages/shared` (`can(role, permission)`); roles Owner/Admin/Editor/Designer/Developer/Viewer. Every route declares its permission; every query is workspace-scoped.

Status: implemented and tested (HTTP controllers, SMTP delivery, MFA, recovery codes); OAuth adapters are not run live.
