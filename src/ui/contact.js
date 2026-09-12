/**
 * How to reach the person who made this.
 *
 * One object, and whichever of its keys is filled in becomes the link behind
 * "Contact US" in the footer. Switching from the phone to the email later is
 * uncommenting one line here and nothing else — which is the whole reason the
 * details sit in an object rather than as three commented-out links in the markup.
 * A commented-out link has to be uncommented *and* wired up, and the second half is
 * the half people forget.
 *
 * The number is a placeholder: live and tappable, and obviously not real, so it is
 * clear it wants replacing rather than quietly dialling nobody.
 */
export const CONTACT = {
  phone: '+966 50 000 0000',
  // email: 'hamad@example.com',
  // website: 'hamad.example.com',
}

/**
 * The first of these that is filled in wins, so uncommenting the email takes over
 * from the phone without anything else changing.
 */
export function contactLink({ email, website, phone } = {}) {
  if (email) return { href: `mailto:${email}`, external: false }
  if (website) return { href: `https://${website.replace(/^https?:\/\//, '')}`, external: true }
  // tel: wants the number without the spaces a person would write it with.
  if (phone) return { href: `tel:${phone.replace(/[^\d+]/g, '')}`, external: false }
  return null
}
