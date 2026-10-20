/** Short-lived, account-scoped form recovery in this tab's memory only. */
const drafts = new Map<string, { expires: number; values: Record<string, string> }>();
const allowed = new Set([
  'vehicleId',
  'originCityId',
  'destinationCityId',
  'startsAt',
  'endsAt',
  'passengers',
  'pickupNote',
  'dropoffNote',
  'seatsOffered',
  'price',
  'seats',
  'message',
  'joinKey',
]);
const lifetime = 30 * 60 * 1000;
function key(account: string, journey: string) {
  return `${account}:${journey}`;
}
export function readJourneyDraft(
  account: string | undefined,
  journey: string,
): Record<string, string> {
  if (!account) return {};
  const entry = drafts.get(key(account, journey));
  if (!entry || entry.expires <= Date.now()) {
    drafts.delete(key(account, journey));
    return {};
  }
  return { ...entry.values };
}
export function rememberJourneyDraft(account: string | undefined, journey: string, form: FormData) {
  if (!account) return;
  const values: Record<string, string> = {};
  for (const [name, value] of form.entries())
    if (allowed.has(name) && typeof value === 'string') values[name] = value.slice(0, 500);
  drafts.set(key(account, journey), { expires: Date.now() + lifetime, values });
  if (drafts.size > 20) drafts.delete(drafts.keys().next().value!);
}
export function forgetJourneyDraft(account: string | undefined, journey: string) {
  if (account) drafts.delete(key(account, journey));
}
export function clearJourneyDrafts() {
  drafts.clear();
}
