// Env-overridable isolated test service endpoints.
//
// Defaults match `compose.test.yml` (the CI/backend-integration stack on
// 11025/18025), so CI behaviour is unchanged. Isolated regression verification
// points the same suites at the dedicated E2E Compose stack (SMTP 11026,
// Mailpit HTTP 18026) through explicit TEST_* overrides instead of editing
// either service definition. The database target follows the existing
// TEST_DATABASE_URL/TEST_MIGRATION_DATABASE_URL override, which the Node
// env-file loader preserves when already set.

export function testSmtpPort(): string {
  return process.env.TEST_SMTP_PORT ?? '11025';
}

export function testMailpitUrl(): string {
  return process.env.TEST_MAILPIT_URL ?? 'http://127.0.0.1:18025';
}
