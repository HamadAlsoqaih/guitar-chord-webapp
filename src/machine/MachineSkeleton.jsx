/**
 * What fills the machine's place while the 3D scene loads.
 *
 * The DOM machine used to stand in here, which meant the app opened on the old flat
 * machine and swapped it for the real one a moment later — a visible downgrade for
 * anyone who had seen the 3D one. This is the shape of the machine and nothing more:
 * it holds the layout, says "loading" without words, and is never mistaken for the
 * thing itself. The DOM machine is still there for the case it was written for — no
 * WebGL, or a context the browser took away — where it is a working machine rather
 * than a placeholder.
 */
export function MachineSkeleton() {
  return (
    <div className="skeleton" aria-hidden="true">
      <div className="skeleton-sign" />
      <div className="skeleton-body">
        <div className="skeleton-window">
          <div className="skeleton-reel" />
          <div className="skeleton-reel" />
          <div className="skeleton-reel" />
        </div>
        <div className="skeleton-marquee" />
      </div>
    </div>
  )
}
