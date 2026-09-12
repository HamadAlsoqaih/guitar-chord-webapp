import { CONTACT, contactLink } from './contact.js'

/** Who made it, and how to reach him. The details live in `contact.js`. */
export function Footer() {
  const link = contactLink(CONTACT)

  return (
    <footer className="footer">
      <span>Made by hamad</span>
      <span className="footer-dot" aria-hidden="true">
        •
      </span>
      {link ? (
        <a
          className="footer-link"
          href={link.href}
          {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          Contact US
        </a>
      ) : (
        // Nothing to reach him on yet: say so plainly rather than offer a dead link.
        <span>Contact US</span>
      )}
    </footer>
  )
}
