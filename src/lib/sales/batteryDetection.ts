// Identifies battery articles by matching the Fortnox article description, since Fortnox
// has no category/warehouse-group field synced anywhere in this app that could do this
// more precisely (see src/lib/sales/businessLine.ts for the equivalent article-NUMBER-based
// approach used for consultancy line items, which doesn't apply here -- batteries aren't a
// small fixed set of known article numbers).
//
// This is a real limitation, not a hidden one: a substring match like this will also catch
// something like "batteriladdare" (battery CHARGER, not a battery) if Fortnox ever has such
// an article. Every match becomes a visible row in the battery_models table with its real
// article description shown, so a false positive is easy to spot and delete -- same "flag
// it, let a human curate" pattern supplier_categories already uses for untagged suppliers.
const BATTERY_NAME_PATTERN = /batteri|battery/i;

export function isBatteryArticle(articleDescription: string | null | undefined): boolean {
  return Boolean(articleDescription && BATTERY_NAME_PATTERN.test(articleDescription));
}
