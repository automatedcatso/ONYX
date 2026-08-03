-- Remove the legacy institution-domain restriction from existing deployments.
-- Supabase Auth still validates email syntax and requires email confirmation.

drop trigger if exists enforce_auth_email_domain_insert on auth.users;
drop trigger if exists enforce_auth_email_domain_update on auth.users;
drop function if exists public.enforce_auth_email_domain();
drop table if exists public.allowed_email_domains;
