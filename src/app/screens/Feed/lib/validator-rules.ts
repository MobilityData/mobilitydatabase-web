/**
 * The GTFS validator's own rule index, used to put readable wording and a
 * file name against the bare notice codes the feed API returns.
 *
 * The index is the validator's, not this app's, so it is read from the
 * validator site rather than copied here: a new release adds rules without
 * needing a change on this side. It is supporting detail only, so a failed
 * fetch degrades to an empty index and the notice list falls back to the
 * humanized code.
 */

import 'server-only';
import { type ValidatorRuleInfo } from './validation-notices';

/** The published rule index behind gtfs-validator.mobilitydata.org/rules.html */
const VALIDATOR_RULES_URL =
  'https://gtfs-validator.mobilitydata.org/rules.json';

/** Rules change only when the validator is released, so this is cached a day. */
const VALIDATOR_RULES_REVALIDATE = 86400;

/** Anchor for one rule on the validator's rules page. */
export function getValidatorRuleUrl(code: string): string {
  return `https://gtfs-validator.mobilitydata.org/rules.html#${code}-rule`;
}

/** Only the fields read here; the published entries carry a good deal more. */
interface RawRule {
  shortSummary?: unknown;
  references?: { fileReferences?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Narrowed by hand rather than trusted: this is a third-party document, and
 * a shape change there should empty a field, not throw on the seal page.
 */
export function parseValidatorRules(
  payload: unknown,
): Record<string, ValidatorRuleInfo> {
  if (!isRecord(payload)) return {};
  const rules: Record<string, ValidatorRuleInfo> = {};
  for (const [code, value] of Object.entries(payload)) {
    if (!isRecord(value)) continue;
    const raw = value as RawRule;
    const summary =
      typeof raw.shortSummary === 'string' && raw.shortSummary.length > 0
        ? raw.shortSummary
        : undefined;
    const fileReferences = isRecord(raw.references)
      ? raw.references.fileReferences
      : undefined;
    const files = Array.isArray(fileReferences)
      ? fileReferences.filter(
          (file): file is string => typeof file === 'string',
        )
      : [];
    rules[code] = { summary, files };
  }
  return rules;
}

export async function getValidatorRules(): Promise<
  Record<string, ValidatorRuleInfo>
> {
  try {
    const response = await fetch(VALIDATOR_RULES_URL, {
      next: {
        revalidate: VALIDATOR_RULES_REVALIDATE,
        tags: ['validator-rules'],
      },
    });
    if (!response.ok) return {};
    return parseValidatorRules(await response.json());
  } catch {
    return {};
  }
}
