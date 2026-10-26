# Staff access and Owner setup

## Apply the RBAC migration

Review the checked-in Supabase migration history and the deployed project before rollout. Back up the database, then apply migrations using the project's normal Supabase migration workflow. The RBAC migration is additive; it does not drop application data. Do not reset a production database to apply it.

After applying the migration, add the initial Owner using the Supabase SQL Editor or a trusted database connection. First authenticate the intended Owner through the existing Supabase Auth flow, verify that account and its Auth UUID directly in Supabase, and replace `VERIFIED_AUTH_USER_UUID` below with that UUID:

```sql
with inserted_owner as (
    insert into public.restaurant_staff_memberships (
        restaurant_id, user_id, email, role, status, activated_at
    )
    select
        1,
        auth_user.id,
        pg_catalog.lower(auth_user.email),
        'owner',
        'active',
        pg_catalog.now()
    from auth.users as auth_user
    where auth_user.id = 'VERIFIED_AUTH_USER_UUID'::uuid
      and auth_user.email is not null
      and auth_user.email_confirmed_at is not null
      and not exists (
          select 1
          from public.restaurant_staff_memberships as existing_owner
          where existing_owner.restaurant_id = 1
            and existing_owner.role = 'owner'
            and existing_owner.status = 'active'
      )
    on conflict (restaurant_id, user_id) do nothing
    returning user_id, email
)
insert into public.restaurant_admin_audit_log (
    restaurant_id, action, target_user_id, target_email, metadata
)
select
    1,
    'owner_bootstrapped',
    inserted_owner.user_id,
    inserted_owner.email,
    '{"source":"trusted_sql_setup"}'::jsonb
from inserted_owner;
```

Verify the inserted row and UUID in the SQL Editor before deploying the application version that requires database-backed membership. This operation is idempotent for the same user and does not promote a different existing membership. The unique active-Owner index prevents a second active Owner.

If the Owner loses access, recover only through a trusted Supabase SQL Editor/database operator after independently verifying the replacement Auth user's identity. Deactivate the previous Owner and promote the verified replacement in one controlled transaction. There is deliberately no public setup endpoint, email-domain rule, first-login promotion, or browser role assignment. Never put the service-role key or a real user UUID in source control.

## Invitation and authentication configuration

The application sends invitations for new accounts with Supabase Auth's server-side `inviteUserByEmail` API. For an email that already has a confirmed Supabase Auth account, the server records a pending membership instead of trying to invite the account again. The existing account holder must sign out and sign in through the normal authentication flow with that account; the callback activates the matching pending membership only after authentication confirms the same Auth user. Configure the project's Auth email delivery provider and allow the deployed `/auth/callback` URL in Supabase Auth's redirect URL settings. Staff must use the email address granted by the Owner or authorized Full Admin.

Apply the migration `20261012112000_existing_staff_account_invitations.sql` before deploying the application change for existing-account grants. The existing-account path does not send a Supabase invitation email; the Owner or Full Admin should notify the account holder to sign in after granting access. The Staff & Access page reports that access is pending until that authentication occurs.

The existing site offers Google OAuth. If an invited address cannot complete the configured Supabase authentication flow, do not manually activate it from the browser; verify the Auth user and resolve the email-provider/provider-linking configuration first. The current Auth setup does not expose a distinct invite-resend endpoint, so the page reports the provider's failure rather than generating or exposing an invitation credential.

`ADMIN_USER_IDS` is no longer an authorization source. Bootstrap the Owner before deploying the new app code; keeping or setting that variable does not grant access.

## Role boundaries

| Capability | Owner | Full Admin | Order Management |
|---|---:|---:|---:|
| Orders and order status workflow | Yes | Yes | Yes |
| Table support and operational table information | Yes | Yes | Yes |
| Record collected payments after physical receipt and verification | Yes | Yes | Yes |
| Menu, categories, tables/QR, settings | Yes | Yes | No |
| Reviews, customer directory, reports | Yes | Yes | No |
| Invite and manage Order Management staff | Yes | Yes | No |
| Grant/revoke Full Admin | Yes | No | No |
| View security audit log | Yes | No | No |
| Create, modify, or deactivate an Owner | Not through staff management | No | No |
