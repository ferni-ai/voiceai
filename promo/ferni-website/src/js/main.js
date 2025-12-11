'use strict';
((function () {
  'use strict';
  const r = (e, t = document) => t.querySelector(e),
    l = (e, t = document) => [...t.querySelectorAll(e)],
    h = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function x(e, t) {
    let n = Date.now();
    return function (...o) {
      n + t - Date.now() < 0 && (e.apply(this, o), (n = Date.now()));
    };
  }
  function I() {
    const e = r('#pageLoader');
    if (!e) return;
    const t = () => {
      (e.classList.add('loaded'), (document.body.style.overflow = ''));
    };
    ((document.body.style.overflow = 'hidden'),
      document.readyState === 'complete'
        ? setTimeout(t, 300)
        : window.addEventListener('load', () => setTimeout(t, 300)),
      setTimeout(t, 3e3));
  }
  function C() {
    const e = r('#hamburger'),
      t = r('#mobileMenu'),
      n = l('.mobile-link');
    if (!e || !t) return;
    const o = () => {
      const s = t.classList.contains('open');
      (e.classList.toggle('active'),
        t.classList.toggle('open'),
        e.setAttribute('aria-expanded', !s),
        (document.body.style.overflow = s ? '' : 'hidden'));
    };
    (e.addEventListener('click', o),
      n.forEach((s) => {
        s.addEventListener('click', () => {
          (e.classList.remove('active'),
            t.classList.remove('open'),
            e.setAttribute('aria-expanded', 'false'),
            (document.body.style.overflow = ''));
        });
      }),
      document.addEventListener('keydown', (s) => {
        s.key === 'Escape' && t.classList.contains('open') && o();
      }));
  }
  function _() {
    const e = r('#nav');
    if (!e) return;
    let t = 0;
    const n = x(() => {
      const o = window.scrollY;
      (o > 50 ? e.classList.add('scrolled') : e.classList.remove('scrolled'),
        window.innerWidth < 768 &&
          (o > t && o > 100
            ? (e.style.transform = 'translateY(-100%)')
            : (e.style.transform = 'translateY(0)')),
        (t = o));
    }, 16);
    (window.addEventListener('scroll', n, { passive: !0 }),
      l('a[href^="#"]').forEach((o) => {
        o.addEventListener('click', function (s) {
          const a = this.getAttribute('href');
          if (a === '#') return;
          const c = r(a);
          if (c) {
            s.preventDefault();
            const i = e.offsetHeight + 20,
              u = c.getBoundingClientRect().top + window.scrollY - i;
            window.scrollTo({ top: u, behavior: h ? 'auto' : 'smooth' });
          }
        });
      }));
  }
  function q() {
    if (h) {
      (l('.reveal').forEach((n) => n.classList.add('visible')),
        l('.privacy-dark__header').forEach((n) => n.classList.add('visible')),
        l('.privacy-dark__card').forEach((n) => n.classList.add('visible')));
      return;
    }
    const e = { root: null, rootMargin: '0px 0px -80px 0px', threshold: 0.1 },
      t = new IntersectionObserver((n) => {
        n.forEach((o) => {
          o.isIntersecting && (o.target.classList.add('visible'), t.unobserve(o.target));
        });
      }, e);
    (l('.reveal').forEach((n) => t.observe(n)),
      l('.privacy-dark__header').forEach((n) => t.observe(n)),
      l('.privacy-dark__card').forEach((n) => t.observe(n)));
  }
  function A() {
    if (h) return;
    const e = l('[data-count]');
    if (e.length === 0) return;
    const t = (o) => {
        const s = parseInt(o.dataset.count, 10),
          a = 2e3,
          c = performance.now(),
          i = (u) => {
            const f = u - c,
              v = Math.min(f / a, 1),
              w = 1 - Math.pow(1 - v, 3),
              E = Math.floor(w * s);
            ((o.textContent = E.toLocaleString() + '+'), v < 1 && requestAnimationFrame(i));
          };
        requestAnimationFrame(i);
      },
      n = new IntersectionObserver(
        (o) => {
          o.forEach((s) => {
            s.isIntersecting && (t(s.target), n.unobserve(s.target));
          });
        },
        { threshold: 0.5 }
      );
    e.forEach((o) => n.observe(o));
  }
  function O() {
    if (h) return;
    const e = l('.hero-orb'),
      t = r('.orb-container');
    if (e.length === 0) return;
    const n = x(() => {
      const o = window.scrollY,
        s = window.innerHeight;
      if (
        (e.forEach((a, c) => {
          const i = 0.3 + c * 0.1,
            u = o * i;
          a.style.transform = `translateY(${u}px)`;
        }),
        t)
      ) {
        const a = s * 0.3,
          c = s * 0.7,
          i = 1 - Math.min(Math.max((o - a) / (c - a), 0), 1);
        t.style.opacity = i;
      }
    }, 16);
    window.addEventListener('scroll', n, { passive: !0 });
  }
  function F() {
    const e = r('#demoOrb'),
      t = r('#demoMessages'),
      n = l('.demo-suggestion');
    if (!e || !t) return;
    const o = {
        "I'm feeling overwhelmed with work":
          "I hear you. Feeling overwhelmed is tough. Let's break this down together. What's the one thing on your plate right now that feels most urgent? Sometimes just naming it helps us see it more clearly.",
        'Help me build better habits':
          "Building habits is one of my favorite topics! The key isn't willpower\u2014it's environment design and tiny steps. What's one small habit you've been wanting to build? Let's make it so easy you can't say no.",
        'Help with a big decision':
          "Big decisions deserve space to breathe. I'm curious\u2014what's the decision you're wrestling with? And more importantly, what's making it feel so big right now?",
      },
      s =
        "I'm here to help you navigate whatever's on your mind. What would you like to talk about today?";
    function a(i, u = !1) {
      const f = document.createElement('div');
      ((f.className = `demo-message ${u ? 'user' : 'assistant'}`),
        u
          ? (f.innerHTML = `<div class="demo-bubble">${i}</div>`)
          : (f.innerHTML = `
          <div class="demo-avatar">FN</div>
          <div class="demo-bubble">${i}</div>
        `),
        (f.style.opacity = '0'),
        (f.style.transform = 'translateY(10px)'),
        t.appendChild(f),
        requestAnimationFrame(() => {
          ((f.style.transition = 'all 0.3s ease-out'),
            (f.style.opacity = '1'),
            (f.style.transform = 'translateY(0)'));
        }),
        (t.scrollTop = t.scrollHeight));
    }
    function c(i) {
      (a(i, !0),
        setTimeout(() => {
          const u = o[i] || s;
          a(u, !1);
        }, 800));
    }
    (n.forEach((i) => {
      i.addEventListener('click', () => {
        const u = i.dataset.prompt;
        (c(u), (i.parentElement.style.display = 'none'));
      });
    }),
      e.addEventListener('click', () => {
        window.open('https://app.ferni.ai', '_blank');
      }));
  }
  function P() {
    l('.persona').forEach((t) => {
      (t.addEventListener('mouseenter', () => {
        const n = t.closest('.persona-orbit');
        n && (n.style.animationPlayState = 'paused');
      }),
        t.addEventListener('mouseleave', () => {
          const n = t.closest('.persona-orbit');
          n && (n.style.animationPlayState = 'running');
        }));
    });
  }
  function B() {
    l('.btn, .demo-suggestion, .team-card').forEach((e) => {
      (e.addEventListener(
        'touchstart',
        () => {
          e.style.transform = 'scale(0.98)';
        },
        { passive: !0 }
      ),
        e.addEventListener(
          'touchend',
          () => {
            e.style.transform = '';
          },
          { passive: !0 }
        ));
    });
  }
  function H() {
    h ||
      'ontouchstart' in window ||
      l('.btn-primary').forEach((e) => {
        (e.addEventListener('mousemove', (t) => {
          const n = e.getBoundingClientRect(),
            o = t.clientX - n.left - n.width / 2,
            s = t.clientY - n.top - n.height / 2;
          e.style.transform = `translate(${o * 0.1}px, ${s * 0.1}px)`;
        }),
          e.addEventListener('mouseleave', () => {
            e.style.transform = '';
          }));
      });
  }
  function R() {
    const e = l('.faq-item');
    e.length !== 0 &&
      e.forEach((t) => {
        const n = t.querySelector('.faq-question');
        n.addEventListener('click', () => {
          const o = t.classList.contains('open');
          (e.forEach((s) => {
            s !== t &&
              (s.classList.remove('open'),
              s.querySelector('.faq-question').setAttribute('aria-expanded', 'false'));
          }),
            t.classList.toggle('open'),
            n.setAttribute('aria-expanded', !o));
        });
      });
  }
  function D() {
    const e = r('#newsletterForm'),
      t = r('#newsletterSuccess');
    e &&
      (e.addEventListener('submit', (n) => {
        const s = e.querySelector('input[type="email"]').value,
          a = e.querySelector('button[type="submit"]');
        (window.trackEvent && window.trackEvent('Newsletter', 'subscribe', 'homepage'),
          localStorage.setItem('ferni_newsletter', s),
          (a.disabled = !0),
          (a.innerHTML = '<span>Subscribing...</span>'),
          setTimeout(() => {
            (e.classList.add('success'), (e.style.display = 'none'), t.classList.add('visible'));
          }, 500));
      }),
      localStorage.getItem('ferni_newsletter') &&
        ((e.style.display = 'none'), t.classList.add('visible')));
  }
  function W() {
    const e = r('#developerForm'),
      t = r('#developerNote'),
      n = r('#developerSuccess');
    e &&
      (e.addEventListener('submit', async (o) => {
        o.preventDefault();
        const a = e.querySelector('input[type="email"]').value,
          c = e.querySelector('button[type="submit"]');
        ((c.disabled = !0),
          (c.innerHTML = 'Submitting...'),
          window.trackEvent && window.trackEvent('Form', 'submit', 'developer-waitlist'));
        try {
          if (
            (
              await fetch('https://formspree.io/f/YOUR_DEVELOPER_FORM_ID', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ email: a, _subject: 'New Developer Early Access Request' }),
              })
            ).ok
          )
            ((e.style.display = 'none'),
              t && (t.style.display = 'none'),
              n && (n.style.display = 'block'),
              localStorage.setItem('ferni_developer_waitlist', a),
              window.trackEvent && window.trackEvent('Form', 'success', 'developer-waitlist'));
          else throw new Error('Form submission failed');
        } catch (i) {
          (console.error('Developer form submission error:', i),
            (c.disabled = !1),
            (c.innerHTML =
              'Request Access <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'),
            window.trackEvent && window.trackEvent('Form', 'error', 'developer-waitlist'));
        }
      }),
      localStorage.getItem('ferni_developer_waitlist') &&
        ((e.style.display = 'none'),
        t && (t.style.display = 'none'),
        n && (n.style.display = 'block')));
  }
  function Y() {
    if ('IntersectionObserver' in window) {
      const e = new IntersectionObserver((t) => {
        t.forEach((n) => {
          if (n.isIntersecting) {
            const o = n.target;
            (o.dataset.src && ((o.src = o.dataset.src), o.removeAttribute('data-src')),
              e.unobserve(o));
          }
        });
      });
      l('img[data-src]').forEach((t) => e.observe(t));
    }
    document.addEventListener('visibilitychange', () => {
      l('.persona-orbit, .wave-bar, .voice-orb').forEach((t) => {
        t.style.animationPlayState = document.hidden ? 'paused' : 'running';
      });
    });
  }
  function $() {
    const e = document.createElement('a');
    ((e.href = '#features'),
      (e.className = 'skip-link'),
      (e.textContent = 'Skip to main content'),
      (e.style.cssText = `
      position: fixed;
      top: -100px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: var(--color-accent);
      color: white;
      border-radius: 8px;
      z-index: 9999;
      transition: top 0.3s;
    `),
      e.addEventListener('focus', () => {
        e.style.top = '20px';
      }),
      e.addEventListener('blur', () => {
        e.style.top = '-100px';
      }),
      document.body.insertBefore(e, document.body.firstChild));
  }
  function N() {
    const e = r('#heroScrollContainer'),
      t = r('#heroVideo') || r('#scrollCanvas'),
      n = r('#heroContentWrapper'),
      o = r('#canvasLoading');
    
    // Hide loading indicator
    if (o) o.classList.add('hidden');
    
    if (!e) {
      console.warn('Scroll animation container not found');
      return;
    }
    
    // Check for video element first
    const video = r('#heroVideo');
    if (video) {
      e.classList.add('canvas-loaded');
      
      if (typeof gsap > 'u' || typeof ScrollTrigger > 'u') {
        console.warn('GSAP or ScrollTrigger not loaded');
        return;
      }
      
      gsap.registerPlugin(ScrollTrigger);
      
      // Parallax effect on video
      gsap.to(video, {
        y: 200,
        scale: 1.1,
        ease: 'none',
        scrollTrigger: {
          trigger: e,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });
      
      // Fade out hero content
      if (n) {
        gsap.to(n, {
          opacity: 0,
          y: -100,
          ease: 'none',
          scrollTrigger: {
            trigger: e,
            start: 'top top',
            end: '30% top',
            scrub: true,
            onLeave: () => { n.style.pointerEvents = 'none'; },
            onEnterBack: () => { n.style.pointerEvents = 'auto'; },
          },
        });
      }
      
      // Pin/unpin the video
      ScrollTrigger.create({
        trigger: e,
        start: 'top top',
        end: 'bottom bottom',
        onLeave: () => {
          video.style.position = 'absolute';
          video.style.top = 'auto';
          video.style.bottom = '0';
        },
        onEnterBack: () => {
          video.style.position = 'fixed';
          video.style.top = '0';
          video.style.bottom = 'auto';
        },
      });
      return;
    }
    
    // Fallback: Canvas-based animation
    if (!t) {
      console.warn('No video or canvas found');
      return;
    }
    if (h) {
      ((t.style.backgroundImage = 'url(images/sequence/frame-001.jpg)'),
        (t.style.backgroundSize = 'cover'),
        (t.style.backgroundPosition = 'center'),
        o && o.classList.add('hidden'));
      return;
    }
    if (typeof gsap > 'u' || typeof ScrollTrigger > 'u') {
      console.warn('GSAP or ScrollTrigger not loaded, skipping scroll animation');
      return;
    }
    const s = t.getContext('2d'),
      a = [],
      c = 70;
    let i = 0;
    const u = [];
    for (let d = 1; d <= 280; d += 4) u.push(String(d).padStart(3, '0'));
    const f = { frame: 0 };
    function v() {
      const d = window.devicePixelRatio || 1,
        p = window.innerWidth,
        m = window.innerHeight;
      ((t.width = p * d),
        (t.height = m * d),
        (t.style.width = p + 'px'),
        (t.style.height = m + 'px'),
        s.scale(d, d));
    }
    function w(d) {
      if (!a[d]) return;
      const p = a[d],
        m = window.innerWidth,
        g = window.innerHeight;
      s.clearRect(0, 0, m, g);
      const L = p.width / p.height,
        z = m / g;
      let b, y, k, S;
      (z > L
        ? ((b = m), (y = m / L), (k = 0), (S = (g - y) / 2))
        : ((y = g), (b = g * L), (k = (m - b) / 2), (S = 0)),
        s.drawImage(p, k, S, b, y));
    }
    function E() {
      u.forEach((d, p) => {
        const m = new Image();
        ((m.onload = () => {
          if (((a[p] = m), i++, o)) {
            const g = Math.round((i / c) * 100);
            o.textContent = `Loading zen garden... ${g}%`;
          }
          (i === c && (o && o.classList.add('hidden'), e.classList.add('canvas-loaded'), T()),
            p === 0 && (v(), w(0)));
        }),
          (m.onerror = () => {
            (console.warn(`Failed to load frame ${d}`),
              i++,
              i === c && (o && o.classList.add('hidden'), T()));
          }),
          (m.src = `images/sequence/frame-${d}.jpg`));
      });
    }
    function T() {
      (gsap.registerPlugin(ScrollTrigger),
        gsap.to(f, {
          frame: c - 1,
          ease: 'none',
          scrollTrigger: {
            trigger: e,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.5,
            onUpdate: (p) => {
              const m = Math.round(f.frame);
              w(m);
            },
          },
        }),
        n &&
          gsap.to(n, {
            opacity: 0,
            y: -100,
            ease: 'none',
            scrollTrigger: {
              trigger: e,
              start: 'top top',
              end: '20% top',
              scrub: !0,
              onLeave: () => {
                n.style.pointerEvents = 'none';
              },
              onEnterBack: () => {
                n.style.pointerEvents = 'auto';
              },
            },
          }),
        ScrollTrigger.create({
          trigger: e,
          start: 'top top',
          end: 'bottom bottom',
          onLeave: () => {
            ((t.style.position = 'absolute'), (t.style.top = 'auto'), (t.style.bottom = '0'));
          },
          onEnterBack: () => {
            ((t.style.position = 'fixed'), (t.style.top = '0'), (t.style.bottom = 'auto'));
          },
        }));
      let d;
      window.addEventListener('resize', () => {
        (clearTimeout(d),
          (d = setTimeout(() => {
            (v(), w(Math.round(f.frame)), ScrollTrigger.refresh());
          }, 100)));
      });
    }
    (v(), E());
  }
  function j() {
    const e = r('#cookieBanner'),
      t = r('#cookieAccept'),
      n = r('#cookieSettings');
    if (!e) return;
    (localStorage.getItem('ferni_cookie_consent')
      ? e.classList.add('hidden')
      : setTimeout(() => {
          e.classList.add('visible');
        }, 1500),
      t &&
        t.addEventListener('click', () => {
          (localStorage.setItem('ferni_cookie_consent', 'all'),
            e.classList.remove('visible'),
            setTimeout(() => {
              e.classList.add('hidden');
            }, 400));
        }),
      n &&
        n.addEventListener('click', () => {
          (localStorage.setItem('ferni_cookie_consent', 'essential'),
            e.classList.remove('visible'),
            setTimeout(() => {
              e.classList.add('hidden');
            }, 400));
        }));
  }
  function M() {
    // Enable JS-only animations (progressive enhancement)
    document.documentElement.classList.add('js-animate');
    (I(),
      _(),
      C(),
      q(),
      A(),
      O(),
      F(),
      P(),
      B(),
      H(),
      Y(),
      $(),
      R(),
      D(),
      W(),
      j(),
      N(),
      console.log('Ferni website initialized'));
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', M) : M();
})(),
  'serviceWorker' in navigator &&
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((r) => {
          console.log('SW registered:', r.scope);
        })
        .catch((r) => {
          console.log('SW registration failed:', r);
        });
    }));
