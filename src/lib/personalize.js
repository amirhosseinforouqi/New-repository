import { EMAIL_TEMPLATE } from '../emailTemplate.js';
import { PLACEHOLDER, FALLBACK_FIRST_NAME } from '../config.js';

/** Replace every occurrence of the placeholder token with a recipient's name. */
export function personalize(firstName, template = EMAIL_TEMPLATE) {
  const name = (firstName || '').trim() || FALLBACK_FIRST_NAME;
  return template.split(PLACEHOLDER).join(name);
}
