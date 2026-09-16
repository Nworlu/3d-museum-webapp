import { useEffect } from "react";
import "./landing.css";
import {
  CheckIcon,
  ColumnsIcon,
  CompassIcon,
  CursorIcon,
  DesktopIcon,
  FrameIcon,
  LayersIcon,
  PhoneIcon,
  ShieldIcon,
  VRIcon,
} from "../icons/MuseumIcons";

const WORDMARK_ICON = (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
    <path d="M13 2 24 9v2H2V9L13 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M4 12v10M9 12v10M13 12v10M17 12v10M22 12v10" stroke="currentColor" strokeWidth="1.6" />
    <path d="M2 24h22" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

export function LandingPage() {
  useEffect(() => {
    const root = document.documentElement;
    const btn = document.getElementById("themeToggle");
    const iconSun = document.getElementById("iconSun") as HTMLElement | null;
    const iconMoon = document.getElementById("iconMoon") as HTMLElement | null;

    let stored: string | null = null;
    try {
      stored = localStorage.getItem("museum-theme");
    } catch {
      /* private browsing / storage blocked */
    }
    if (stored === "light" || stored === "dark") root.setAttribute("data-theme", stored);

    function current() {
      const attr = root.getAttribute("data-theme");
      if (attr) return attr;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    function syncIcon() {
      const dark = current() === "dark";
      if (iconSun) iconSun.style.display = dark ? "none" : "";
      if (iconMoon) iconMoon.style.display = dark ? "" : "none";
    }
    syncIcon();

    function onToggleClick() {
      const next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("museum-theme", next);
      } catch {
        /* private browsing / storage blocked */
      }
      syncIcon();
    }
    btn?.addEventListener("click", onToggleClick);

    // Scroll-reveal: sections fade/lift into place as they enter the
    // viewport, like gallery lights coming up room by room. Elements are
    // fully visible by default in the CSS — reveal-ready is only added here,
    // after JS has definitely run, so there's no window where content
    // depends on JS to be seen at all.
    const targets = document.querySelectorAll(".landing-page .reveal");
    let io: IntersectionObserver | undefined;
    let revealTimeout: number | undefined;
    if (targets.length) {
      if (!("IntersectionObserver" in window)) {
        targets.forEach((el) => el.classList.add("revealed"));
      } else {
        targets.forEach((el) => el.classList.add("reveal-ready"));
        io = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add("revealed");
                io?.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
        );
        targets.forEach((el) => io?.observe(el));

        // Belt-and-suspenders: anything still unrevealed after 2.5s is shown
        // anyway, so a missed observer entry never leaves content invisible.
        revealTimeout = window.setTimeout(() => {
          targets.forEach((el) => el.classList.add("revealed"));
        }, 2500);
      }
    }

    // Hero salon: settle the floating paintings into place shortly after
    // load. The .unsettled starting state is only ever added here, so a
    // visitor without JS sees the paintings in their final position
    // immediately, never a blank frame.
    const salon = document.querySelector(".landing-page .salon");
    let raf1 = 0;
    let raf2 = 0;
    if (salon) {
      salon.classList.add("unsettled");
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => salon.classList.add("settled"));
      });
    }

    // Stats count-up: numbers climb from 0 to their real value once the
    // stats row scrolls into view, instead of sitting there static.
    const counters = document.querySelectorAll<HTMLElement>(".landing-page [data-count-to]");
    let countIo: IntersectionObserver | undefined;
    if (counters.length) {
      const reduceMotion = !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
      const animateCounter = (el: HTMLElement) => {
        const target = Number(el.dataset.countTo ?? "0");
        const suffix = el.dataset.countSuffix ?? "";
        if (reduceMotion || target === 0) {
          el.textContent = `${target}${suffix}`;
          return;
        }
        const duration = 1200;
        const start = performance.now();
        function tick(now: number) {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = `${Math.round(eased * target)}${suffix}`;
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      };
      if (!("IntersectionObserver" in window)) {
        counters.forEach(animateCounter);
      } else {
        countIo = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                animateCounter(entry.target as HTMLElement);
                countIo?.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.4 },
        );
        counters.forEach((el) => countIo?.observe(el));
      }
    }

    // Scroll-scrubbed text: an illuminated-manuscript effect where a
    // paragraph's words light up in step with how far the reader has
    // scrolled past it, rather than all firing at once.
    const paras = document.querySelectorAll<HTMLElement>(".landing-page [data-scrub]");
    let onScroll: (() => void) | undefined;
    const restoreParas: Array<{ el: HTMLElement; text: string }> = [];
    if (paras.length && window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
      const items: Array<{ el: HTMLElement; words: HTMLElement[] }> = [];
      paras.forEach((p) => {
        restoreParas.push({ el: p, text: p.innerHTML });
        const words = p.textContent?.split(/(\s+)/) ?? [];
        p.innerHTML = "";
        const wordEls: HTMLElement[] = [];
        words.forEach((chunk) => {
          if (chunk.trim() === "") {
            p.appendChild(document.createTextNode(chunk));
          } else {
            const span = document.createElement("span");
            span.className = "w";
            span.textContent = chunk;
            p.appendChild(span);
            wordEls.push(span);
          }
        });
        items.push({ el: p, words: wordEls });
      });

      let ticking = false;
      function update() {
        ticking = false;
        const vh = window.innerHeight;
        items.forEach((item) => {
          const rect = item.el.getBoundingClientRect();
          // Scrub window: starts as the paragraph's top crosses 85% of
          // viewport height, finishes as its bottom crosses 45% — so it
          // lights up while passing through the lower-middle of the screen,
          // roughly where a reader's eye actually is.
          const startY = vh * 0.85;
          const endY = vh * 0.45;
          const span = startY - endY + rect.height;
          let progress = (startY - rect.top) / span;
          progress = Math.max(0, Math.min(1, progress));
          const lit = Math.round(progress * item.words.length);
          item.words.forEach((w, i) => {
            const shouldBeLit = i < lit;
            if (shouldBeLit !== w.classList.contains("lit")) w.classList.toggle("lit", shouldBeLit);
          });
        });
      }
      onScroll = () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      };
      update();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    }

    return () => {
      btn?.removeEventListener("click", onToggleClick);
      io?.disconnect();
      countIo?.disconnect();
      if (revealTimeout) window.clearTimeout(revealTimeout);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (onScroll) {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      }
      restoreParas.forEach(({ el, text }) => {
        el.innerHTML = text;
      });
    };
  }, []);

  return (
    <div className="landing-page">
      <header>
        <div className="wrap nav">
          <a className="wordmark" href="#top">
            {WORDMARK_ICON}
            The Unbound Museum
          </a>
          <ul className="nav-links">
            <li>
              <a href="#collection">The Collection</a>
            </li>
            <li>
              <a href="#how">How It Works</a>
            </li>
            <li>
              <a href="#visit">Visit Modes</a>
            </li>
            <li>
              <a href="#faq">FAQ</a>
            </li>
          </ul>
          <div className="nav-right">
            <button className="theme-toggle" id="themeToggle" aria-label="Toggle dark mode" type="button">
              <svg id="iconSun" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.3" />
                <path
                  d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4 3.3 3.3"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
              <svg id="iconMoon" width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: "none" }}>
                <path
                  d="M13.8 9.6A6 6 0 1 1 6.4 2.2a5 5 0 0 0 7.4 7.4Z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <a className="btn btn-primary" href="/museum">
              Enter the Galleries
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="wrap hero">
          <div className="hero-copy">
            <span className="label">A Walkable 3D Museum &middot; Built With Babylon.js</span>
            <h1>
              Six Masterworks.
              <br />
              <span className="muted">Zero Plane Tickets.</span>
            </h1>
            <p className="sub">
              Walk the halls of a museum that exists only in a browser tab. The Starry Night, the Mona Lisa, and four
              more masters — rendered in real time, room by room, with nothing to install and no line at the door.
            </p>
            <div className="hero-ctas">
              <a className="btn btn-primary" href="/museum">
                Enter the Museum
              </a>
              <a className="btn btn-ghost" href="#how">
                How It's Built <span className="arrow">&rarr;</span>
              </a>
            </div>
          </div>
          <div className="salon" aria-hidden="true">
            <img className="p1" src="/art/starry-night.jpg" alt="" />
            <img className="p2" src="/art/girl-pearl-earring.jpg" alt="" />
            <img className="p3" src="/art/great-wave.jpg" alt="" />
            <img className="p4" src="/art/mona-lisa.jpg" alt="" />
            <img className="p5" src="/art/impression-sunrise.jpg" alt="" />
            <img className="p6" src="/art/birth-of-venus.jpg" alt="" />
          </div>
        </section>

        {/* ARTIST STRIP — infinite marquee, paused on hover */}
        <section className="wrap artists framed reveal">
          <span className="label">Featured in this hang</span>
          <div className="marquee-wrap">
            <div className="marquee-track">
              {[0, 1].map((copy) => (
                <span key={copy} aria-hidden={copy === 1} style={{ display: "flex", gap: 30 }}>
                  <span>Van Gogh</span>
                  <span>&middot;</span>
                  <span>Vermeer</span>
                  <span>&middot;</span>
                  <span>Hokusai</span>
                  <span>&middot;</span>
                  <span>da Vinci</span>
                  <span>&middot;</span>
                  <span>Monet</span>
                  <span>&middot;</span>
                  <span>Botticelli</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURE 1 */}
        <section className="wrap feature framed reveal" id="how">
          <div className="feature-copy">
            <span className="label">Room I &middot; The Engine</span>
            <h2 style={{ marginTop: 14 }}>
              One Engine,
              <br />
              <span className="muted">Infinite Galleries.</span>
            </h2>
            <p className="lede scrub" data-scrub="true">
              Every exhibit here is data, not code. A curator picks a room and a wall, uploads an image, and the
              museum figures out the placement — nothing about the renderer has to change, and nothing has to be
              rebuilt.
            </p>
            <dl className="grid-2x2">
              <div>
                <dt>
                  <CompassIcon size={18} className="dt-icon" /> Walk &amp; Look Around
                </dt>
                <dd>WASD to move, mouse to look — the same controls as any first-person walkthrough.</dd>
              </div>
              <div>
                <dt>
                  <CursorIcon size={18} className="dt-icon" /> Click to Inspect
                </dt>
                <dd>Click a piece and the camera dollies in as a wall label opens beside it.</dd>
              </div>
              <div>
                <dt>
                  <LayersIcon size={18} className="dt-icon" /> Room-Based Streaming
                </dt>
                <dd>Only the gallery you're standing in, plus the one next door, is ever loaded.</dd>
              </div>
              <div>
                <dt>
                  <ShieldIcon size={18} className="dt-icon" /> A Real Curator Dashboard
                </dt>
                <dd>Add or remove an exhibit from a password-protected admin page — no JSON, no redeploy.</dd>
              </div>
            </dl>
          </div>
          <div className="feature-visual shot">
            <img
              src="/landing/screenshot-gallery.png"
              alt="Screenshot of The Starry Night hanging on a gallery wall inside the running museum"
            />
          </div>
        </section>

        {/* FEATURE 2 */}
        <section className="wrap feature reverse framed reveal">
          <div className="feature-copy">
            <span className="label">Room II &middot; Under the Frame</span>
            <h2 style={{ marginTop: 14 }}>
              Engineered for a
              <br />
              <span className="muted">Smooth Walkthrough.</span>
            </h2>
            <p className="lede scrub" data-scrub="true">
              A museum you can run through fast is one that has to plan for that. Every one of these came out of an
              actual eng review, not a wish list.
            </p>
            <div className="accordion">
              <div className="acc-item">
                <h3>Asset Caching</h3>
                <p>A painting or model used in two rooms is fetched once and reused, not re-downloaded per wall.</p>
              </div>
              <div className="acc-item">
                <h3>Generation-Guarded Loading</h3>
                <p>Sprint through a doorway and a slow, stale load from the room behind you is discarded, never shown.</p>
              </div>
              <div className="acc-item">
                <h3>Perimeter Collision</h3>
                <p>Real walls and open archways — you can walk fast, but never off the edge of the building.</p>
              </div>
              <div className="acc-item">
                <h3>Content-Hash Versioning</h3>
                <p>Every visitor's cache invalidates the instant a curator publishes a change.</p>
              </div>
            </div>
          </div>
          <div className="feature-visual floorplan">
            <svg viewBox="0 0 460 210" role="img" aria-labelledby="fpTitle">
              <title id="fpTitle">Floor plan: Lobby, Gallery I, and Gallery II connected in a line by open archways</title>
              <g fill="none" stroke="var(--stone-line)" strokeWidth={1.5}>
                <rect x="20" y="20" width="120" height="170" />
                <rect x="170" y="20" width="120" height="170" />
                <rect x="320" y="20" width="120" height="170" />
              </g>
              <g stroke="var(--wall)" strokeWidth={10}>
                <line x1="140" y1="90" x2="170" y2="90" />
                <line x1="290" y1="90" x2="320" y2="90" />
              </g>
              <g fill="var(--ink)" fontSize={12} textAnchor="middle">
                <text x="80" y="15">LOBBY</text>
                <text x="230" y="15">GALLERY I</text>
                <text x="380" y="15">GALLERY II</text>
              </g>
              <g fill="var(--brass)" fontSize={20} fontWeight={600} textAnchor="middle">
                <text x="80" y="112">I</text>
                <text x="230" y="112">II</text>
                <text x="380" y="112">III</text>
              </g>
              <g fill="var(--stone)" fontSize={9} textAnchor="middle">
                <text x="80" y="165">2 exhibits</text>
                <text x="230" y="165">2 exhibits</text>
                <text x="380" y="165">3 exhibits</text>
              </g>
            </svg>
          </div>
        </section>

        {/* COLLECTION */}
        <section className="wrap collection-head framed reveal" id="collection">
          <span className="label">On View Now</span>
          <h2 style={{ marginTop: 14 }}>The Collection</h2>
          <p>
            Six works, chosen for one reason above all others: they are unambiguously, permanently in the public
            domain — old enough that no jurisdiction's copyright term touches them.
          </p>
        </section>
        <div className="wrap collection-grid">
          {[
            { src: "starry-night.jpg", alt: "The Starry Night by Vincent van Gogh", title: "The Starry Night", meta: "Van Gogh · 1889 · Oil on canvas" },
            { src: "girl-pearl-earring.jpg", alt: "Girl with a Pearl Earring by Johannes Vermeer", title: "Girl with a Pearl Earring", meta: "Vermeer · c. 1665 · Oil on canvas" },
            { src: "great-wave.jpg", alt: "The Great Wave off Kanagawa by Hokusai", title: "The Great Wave off Kanagawa", meta: "Hokusai · c. 1831 · Woodblock print" },
            { src: "mona-lisa.jpg", alt: "Mona Lisa by Leonardo da Vinci", title: "Mona Lisa", meta: "da Vinci · c. 1503 · Oil on poplar" },
            { src: "impression-sunrise.jpg", alt: "Impression, Sunrise by Claude Monet", title: "Impression, Sunrise", meta: "Monet · 1872 · Oil on canvas" },
            { src: "birth-of-venus.jpg", alt: "The Birth of Venus by Sandro Botticelli", title: "The Birth of Venus", meta: "Botticelli · c. 1486 · Tempera on canvas" },
          ].map((piece) => (
            <article className="piece reveal" key={piece.src}>
              <div className="frame">
                <img src={`/art/${piece.src}`} alt={piece.alt} />
              </div>
              <div className="caption">
                <h3>{piece.title}</h3>
                <p className="label meta">{piece.meta}</p>
              </div>
            </article>
          ))}
        </div>

        {/* STATS — numbers count up from 0 when scrolled into view */}
        <div className="wrap stats framed reveal">
          <div className="stat">
            <FrameIcon size={22} className="stat-icon" />
            <div className="num" data-count-to="6">0</div>
            <div className="label cap">Masterworks</div>
          </div>
          <div className="stat">
            <ColumnsIcon size={22} className="stat-icon" />
            <div className="num" data-count-to="3">0</div>
            <div className="label cap">Galleries</div>
          </div>
          <div className="stat">
            <CheckIcon size={22} className="stat-icon" />
            <div className="num" data-count-to="100" data-count-suffix="%">0%</div>
            <div className="label cap">Public Domain</div>
          </div>
          <div className="stat">
            <VRIcon size={22} className="stat-icon" />
            <div className="num" data-count-to="0">0</div>
            <div className="label cap">Headsets Required</div>
          </div>
        </div>

        {/* VISIT MODES */}
        <section className="wrap visit-head framed reveal" id="visit">
          <span className="label">Access</span>
          <h2 style={{ marginTop: 14 }}>Three Ways to Visit</h2>
          <p>No membership tiers here — this is a status report on where the museum actually stands, not a sales page.</p>
        </section>
        <div className="wrap visit-grid">
          <div className="visit-card reveal">
            <DesktopIcon size={26} className="visit-icon" />
            <span className="status status-shipped">Shipped</span>
            <h3>On Desktop</h3>
            <p className="desc">Full walkthrough today: WASD movement, mouse-look, click-to-inspect, real collision.</p>
            <ul>
              <li>Chrome, Firefox, Safari</li>
              <li>Keyboard + mouse</li>
              <li>Runs at 1080p and up</li>
            </ul>
          </div>
          <div className="visit-card reveal">
            <PhoneIcon size={26} className="visit-icon" />
            <span className="status status-shipped">Shipped</span>
            <h3>On Tablet &amp; Phone</h3>
            <p className="desc">Full walkthrough on touch too: drag to look, an on-screen joystick to walk, tap to inspect.</p>
            <ul>
              <li>Touch-drag to look</li>
              <li>Virtual joystick to walk</li>
              <li>Same collision, same room streaming</li>
            </ul>
          </div>
          <div className="visit-card reveal">
            <VRIcon size={26} className="visit-icon" />
            <span className="status status-planned">Designed For</span>
            <h3>In VR</h3>
            <p className="desc">Babylon.js ships WebXR support out of the box — the room-streaming architecture was built to carry it.</p>
            <ul>
              <li>No headset-specific rebuild needed</li>
              <li>Depth sensing supported upstream</li>
              <li>Deferred, not blocked</li>
            </ul>
          </div>
        </div>

        {/* FAQ */}
        <section className="wrap faq-wrap framed reveal" id="faq">
          <div className="faq-head">
            <span className="label">Questions</span>
            <h2 style={{ marginTop: 14 }}>From the Visitors' Book</h2>
            <p>The things people actually ask when they hear "a museum in a browser tab."</p>
          </div>
          <div>
            <details className="faq" open>
              <summary>
                Is this really running in a browser? <span className="icon">+</span>
              </summary>
              <p>
                Yes — no plugin, no download. Babylon.js renders the whole scene with WebGL, the same technology your
                browser already uses for video and canvas graphics.
              </p>
            </details>
            <details className="faq">
              <summary>
                Can a new painting be added without touching code? <span className="icon">+</span>
              </summary>
              <p>
                Yes — through an actual admin dashboard, not a text editor. A curator logs in, picks a room and a
                wall, uploads an image, and the museum computes the placement and frame size itself. It's on the wall
                on the next visit.
              </p>
            </details>
            <details className="faq">
              <summary>
                Is the art really public domain? <span className="icon">+</span>
              </summary>
              <p>
                All six works were chosen specifically because they're old enough — 1500s to 1916 — that
                public-domain status isn't ambiguous in any jurisdiction. Sourced from Wikimedia Commons.
              </p>
            </details>
            <details className="faq">
              <summary>
                What is Babylon.js? <span className="icon">+</span>
              </summary>
              <p>
                An open-source 3D engine for the web — the same category as Three.js, built by Microsoft's team, used
                for games, product configurators, and virtual showrooms.
              </p>
            </details>
            <details className="faq">
              <summary>
                Does it work on my phone? <span className="icon">+</span>
              </summary>
              <p>Yes — drag to look around, use the on-screen joystick to walk, and tap a piece to inspect it. Same museum, same collision, touch-native controls.</p>
            </details>
            <details className="faq">
              <summary>
                Where's the code? <span className="icon">+</span>
              </summary>
              <p>This is an active build — architecture, tests, and the full design doc exist, and the plan is to open it up once the walkthrough is complete on every device.</p>
            </details>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="wrap final-cta framed reveal">
          <span className="label">Doors Open</span>
          <h2 style={{ marginTop: 16 }}>
            Ready to Walk
            <br />
            the Halls?
          </h2>
          <div className="ctas">
            <a className="btn btn-primary" href="/museum">
              Enter the Museum
            </a>
            <a className="btn btn-ghost" href="#how">
              Read How It Works
            </a>
          </div>
        </section>
      </main>

      <footer className="framed">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <a className="wordmark" href="#top">
                {WORDMARK_ICON}
                The Unbound Museum
              </a>
              <p>
                A walkable 3D museum rendered entirely in the browser with Babylon.js and React — built room by room,
                with the exhibits driven by data, not code.
              </p>
            </div>
            <div className="foot-col">
              <h4>Museum</h4>
              <ul>
                <li>
                  <a href="#collection">The Collection</a>
                </li>
                <li>
                  <a href="#how">How It Works</a>
                </li>
                <li>
                  <a href="#visit">Visit Modes</a>
                </li>
              </ul>
            </div>
            <div className="foot-col">
              <h4>Project</h4>
              <ul>
                <li>
                  <a href="#faq">FAQ</a>
                </li>
                <li>
                  <a href="#top">Back to Top</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <span>&copy; 2026 The Unbound Museum. Built with Babylon.js, React, and six paintings that outlived their copyrights.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
