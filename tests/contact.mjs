import { contactLink } from '../src/ui/contact.js'

/**
 * The footer's contact link.
 *
 * The arrangement it is testing is a promise to whoever edits it later:
 * uncomment a line in CONTACT and the link follows, with nothing else to change.
 * That is worth holding to, so it is checked here rather than by hand.
 */
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${name}${detail ? `   ${detail}` : ''}`)
}

const phoneOnly = contactLink({ phone: '+966 50 000 0000' })
check('the phone dials', phoneOnly?.href === 'tel:+966500000000', phoneOnly?.href)
check('and the spaces a person writes are stripped', !/\s/.test(phoneOnly.href))

const withEmail = contactLink({ phone: '+966 50 000 0000', email: 'hamad@example.com' })
check('uncommenting the email takes over', withEmail?.href === 'mailto:hamad@example.com', withEmail?.href)

const withSite = contactLink({ phone: '+966 50 000 0000', website: 'hamad.example.com' })
check('uncommenting the site takes over from the phone', withSite?.href === 'https://hamad.example.com', withSite?.href)
check('and it opens in its own tab', withSite?.external === true)

const both = contactLink({ phone: '+1', website: 'hamad.example.com', email: 'hamad@example.com' })
check('email outranks the website', both?.href === 'mailto:hamad@example.com', both?.href)

const alreadyAbsolute = contactLink({ website: 'https://hamad.example.com' })
check('a website written in full is not doubled up', alreadyAbsolute?.href === 'https://hamad.example.com', alreadyAbsolute?.href)

check('nothing filled in means no link at all', contactLink({}) === null)

console.log(failures ? `\n${failures} failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
