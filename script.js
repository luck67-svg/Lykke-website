/* ============================================================
   Lykke · Personal Site — Interactions
   - Sticky header shadow on scroll
   - Active nav link based on scroll position
   - Mobile nav toggle
   - IntersectionObserver-based entrance animations
   - Smooth scroll for anchor links
   ============================================================ */

(function () {
    'use strict';

    const header    = document.querySelector('.site-header');
    const nav       = document.querySelector('.site-nav');
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks  = document.querySelectorAll('.nav-link');
    const sections  = document.querySelectorAll('section[id]');
    const animated  = document.querySelectorAll('[data-anim]');

    /* ---- 1. Header shadow on scroll ----------------------- */
    function onScroll() {
        if (window.scrollY > 12) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ---- 2. Active nav based on scroll position ----------- */
    function setActiveLink() {
        const scrollPos = window.scrollY + 120; // offset for header
        let current = '';

        sections.forEach((sec) => {
            if (sec.offsetTop <= scrollPos && sec.offsetTop + sec.offsetHeight > scrollPos) {
                current = sec.id;
            }
        });

        navLinks.forEach((link) => {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + current) {
                link.classList.add('active');
            }
        });
    }
    window.addEventListener('scroll', setActiveLink, { passive: true });

    /* ---- 3. Mobile nav toggle ----------------------------- */
    if (navToggle) {
        navToggle.addEventListener('click', () => {
            const isOpen = nav.classList.toggle('open');
            navToggle.setAttribute('aria-expanded', isOpen);
        });
        // close menu when a link is tapped
        navLinks.forEach((link) => {
            link.addEventListener('click', () => {
                nav.classList.remove('open');
                navToggle.setAttribute('aria-expanded', 'false');
            });
        });
    }

    /* ---- 4. Entrance animations via IntersectionObserver - */
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('in-view');
                        io.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.05, rootMargin: '0px 0px -40px 0px' }
        );
        animated.forEach((el) => {
            // Hero elements: reveal immediately on next frame (no scroll needed)
            if (el.closest('.hero')) {
                requestAnimationFrame(() => el.classList.add('in-view'));
            } else {
                io.observe(el);
            }
        });
        // Safety net: reveal everything after 800ms no matter what
        setTimeout(() => {
            animated.forEach((el) => el.classList.add('in-view'));
        }, 800);
    } else {
        animated.forEach((el) => el.classList.add('in-view'));
    }

    /* ---- 5. Inline project video (click to play in card) - */
    // Each project has a <video> + a "Play Demo" button.
    // Click the button → video plays inside the card.
    // Click the video again → pause (browser native).
    // When video ends → return to poster + show play button.
    document.querySelectorAll('[data-play]').forEach((playBtn) => {
        const visual = playBtn.closest('.project-visual');
        const video  = visual ? visual.querySelector('[data-project-video]') : null;
        if (!visual || !video) return;

        playBtn.addEventListener('click', () => {
            // Mute-aware play (browsers require muted autoplay in some cases,
            // but user click is a deliberate gesture so unmuted is fine).
            video.play().then(() => {
                visual.setAttribute('data-playing', 'true');
                video.setAttribute('data-playing', 'true');
                playBtn.hidden = true;
            }).catch((err) => {
                console.warn('Video play failed:', err);
            });
        });

        // When the video ends, reset the UI to the poster + play button state.
        video.addEventListener('ended', () => {
            visual.removeAttribute('data-playing');
            video.removeAttribute('data-playing');
            video.currentTime = 0;
            playBtn.hidden = false;
        });
    });

    /* ---- 6. Smooth scroll with header offset -------------- */
    // Most browsers honor CSS `scroll-behavior: smooth`; this is a fallback
    // that respects the sticky header height.
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('href');
            if (!targetId || targetId === '#') return;
            const target = document.querySelector(targetId);
            if (!target) return;
            e.preventDefault();
            const headerH = header.offsetHeight - 8;
            const top = target.getBoundingClientRect().top + window.scrollY - headerH;
            window.scrollTo({ top, behavior: 'smooth' });
        });
    });
})();

/* ============================================================
   Lightbox — opens the full-resolution image / video when a
   project card is clicked. Reuses the existing #demoModal
   container; switches its media slot between <img> and <video>.
   For images, supports wheel-zoom, double-click toggle, and
   click-and-drag panning. Video uses native browser controls.
   ============================================================ */
(function () {
    'use strict';
    const modal      = document.getElementById('demoModal');
    if (!modal) return;

    const backdrop   = modal.querySelector('.demo-modal-backdrop');
    const closeBtn   = modal.querySelector('.demo-modal-close');
    const mediaSlot  = document.getElementById('demoVideoContainer');
    const titleEl    = document.getElementById('demoTitle');
    const descEl     = document.getElementById('demoDesc');
    const externalEl = document.getElementById('demoExternal');
    let lastFocus    = null;

    // ---- Zoom state (only used for image mode) ----
    const ZOOM_MIN = 0.5;
    const ZOOM_MAX = 8;
    let currentMedia = null;       // <img> or <video> element
    let currentType  = 'image';
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0, baseX = 0, baseY = 0;
    let levelEl = null;

    function applyTransform() {
        if (!currentMedia || currentType !== 'image') return;
        currentMedia.style.transform =
            'translate(-50%, -50%) ' +
            'translate(' + panX + 'px, ' + panY + 'px) ' +
            'scale(' + zoom + ')';
        if (levelEl) levelEl.textContent = Math.round(zoom * 100) + '%';
        mediaSlot.style.cursor = zoom > 1.01
            ? (isDragging ? 'grabbing' : 'grab')
            : 'zoom-in';
    }

    function setZoom(next, clientX, clientY) {
        const old = zoom;
        zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
        if (clientX != null && clientY != null && old !== zoom) {
            // Keep the cursor-anchored point stable under the mouse.
            const rect = mediaSlot.getBoundingClientRect();
            const lx = clientX - rect.left - rect.width  / 2;
            const ly = clientY - rect.top  - rect.height / 2;
            const r  = zoom / old;
            panX = (panX - lx) * r + lx;
            panY = (panY - ly) * r + ly;
        }
        applyTransform();
    }

    function resetZoom() {
        zoom = 1; panX = 0; panY = 0;
        applyTransform();
    }

    function openLightbox(type, src, title, caption) {
        if (!src) return;
        lastFocus   = document.activeElement;
        currentType = type;
        zoom = 1; panX = 0; panY = 0;
        isDragging = false;

        // Tag the modal so CSS can size it per media type.
        modal.setAttribute('data-type', type);

        // Stop anything currently in the slot.
        mediaSlot.innerHTML = '';

        if (type === 'image') {
            const img = document.createElement('img');
            img.src = src;
            img.alt = caption || title || '';
            img.decoding = 'async';
            img.draggable = false;
            img.style.cssText =
                'position:absolute;top:50%;left:50%;width:100%;height:100%;' +
                'object-fit:contain;background:#000;transform-origin:center;' +
                'transform:translate(-50%,-50%) scale(1);' +
                '-webkit-user-drag:none;user-select:none;';
            mediaSlot.appendChild(img);
            currentMedia = img;

            // Floating zoom control chip (image only).
            const ctrls = document.createElement('div');
            ctrls.className = 'demo-zoom-controls';
            ctrls.innerHTML =
                '<button class="demo-zoom-btn" type="button" data-zoom-out aria-label="缩小">−</button>' +
                '<span class="demo-zoom-level" data-zoom-reset role="button" tabindex="0" title="点击重置">100%</span>' +
                '<button class="demo-zoom-btn" type="button" data-zoom-in aria-label="放大">+</button>';
            mediaSlot.appendChild(ctrls);
            levelEl = ctrls.querySelector('[data-zoom-reset]');
            ctrls.querySelector('[data-zoom-in]').addEventListener('click', (e) => {
                e.stopPropagation();
                setZoom(zoom * 1.25);
            });
            ctrls.querySelector('[data-zoom-out]').addEventListener('click', (e) => {
                e.stopPropagation();
                setZoom(zoom * 0.8);
            });
            levelEl.addEventListener('click', (e) => {
                e.stopPropagation();
                resetZoom();
            });
        } else if (type === 'pdf') {
            // Embed the PDF via iframe; Chrome / Edge / Firefox render it
            // inline, Safari (desktop) renders inline, iOS Safari opens it
            // in a native viewer. Toolbar is shown so the user can download
            // or print if they want.
            const iframe = document.createElement('iframe');
            iframe.src = src + '#view=FitH&toolbar=1';
            iframe.title = title || 'PDF';
            iframe.setAttribute('allow', 'fullscreen');
            iframe.style.cssText =
                'position:absolute;inset:0;width:100%;height:100%;' +
                'border:0;background:#fff;';
            mediaSlot.appendChild(iframe);
            currentMedia = iframe;
            levelEl = null;
        } else {
            const v = document.createElement('video');
            v.src = src;
            v.controls = true;
            v.autoplay = true;
            v.playsInline = true;
            v.preload = 'auto';
            v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;';
            mediaSlot.appendChild(v);
            currentMedia = v;
            levelEl = null;
        }

        titleEl.textContent = title || '';
        descEl.textContent  = caption || '';

        // "Open in new tab" only makes sense for videos.
        if (type === 'video') {
            externalEl.href = src;
            externalEl.textContent = '在新窗口打开 →';
            externalEl.style.display = '';
        } else {
            externalEl.style.display = 'none';
        }

        mediaSlot.style.cursor = type === 'image' ? 'zoom-in' : 'default';
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        if (closeBtn) closeBtn.focus();
    }

    function closeLightbox() {
        if (modal.getAttribute('aria-hidden') === 'true') return;
        mediaSlot.querySelectorAll('video').forEach((v) => {
            try { v.pause(); } catch (e) { /* noop */ }
            v.removeAttribute('src');
            v.load();
        });
        // Detach the iframe (PDF) so the browser actually unloads it
        mediaSlot.querySelectorAll('iframe').forEach((f) => { f.src = 'about:blank'; });
        mediaSlot.innerHTML = '';
        currentMedia = null;
        levelEl = null;
        zoom = 1; panX = 0; panY = 0; isDragging = false;
        mediaSlot.style.cursor = '';
        modal.removeAttribute('data-type');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        if (lastFocus && typeof lastFocus.focus === 'function') {
            lastFocus.focus();
        }
    }

    // ---- Wheel zoom (image only) ----
    mediaSlot.addEventListener('wheel', (e) => {
        if (currentType !== 'image' || !currentMedia) return;
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.88 : 1.14;
        setZoom(zoom * factor, e.clientX, e.clientY);
    }, { passive: false });

    // ---- Double-click toggle (image only) ----
    mediaSlot.addEventListener('dblclick', (e) => {
        if (currentType !== 'image' || !currentMedia) return;
        if (zoom > 1.01) resetZoom();
        else setZoom(2.5, e.clientX, e.clientY);
    });

    // ---- Drag-to-pan (image only, requires zoom > 1) ----
    mediaSlot.addEventListener('mousedown', (e) => {
        if (currentType !== 'image' || !currentMedia || zoom <= 1.01) return;
        // Don't start a pan when the user clicks the floating control chip.
        if (e.target.closest('.demo-zoom-controls')) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        baseX = panX;
        baseY = panY;
        mediaSlot.style.cursor = 'grabbing';
        e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        panX = baseX + (e.clientX - dragStartX);
        panY = baseY + (e.clientY - dragStartY);
        applyTransform();
    });
    window.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        applyTransform();
    });

    // ---- Bind every [data-lightbox] card ----
    document.querySelectorAll('[data-lightbox]').forEach((el) => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('[data-play]')) return;     // inline play
            const inlineVid = el.querySelector('[data-project-video]');
            if (inlineVid && inlineVid.hasAttribute('data-playing')) return;
            const type    = el.getAttribute('data-lightbox');
            const src     = el.getAttribute('data-lightbox-src');
            const title   = el.getAttribute('data-lightbox-title')   || '';
            const caption = el.getAttribute('data-lightbox-caption') || '';
            openLightbox(type, src, title, caption);
        });
    });

    // ---- Close handlers ----
    [backdrop, closeBtn].filter(Boolean).forEach((el) => {
        el.addEventListener('click', closeLightbox);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
            closeLightbox();
        }
    });

    // ---- "View Resume" button → opens PDF in the same lightbox ----
    document.querySelectorAll('[data-resume]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const src     = btn.getAttribute('data-resume-src');
            const title   = btn.getAttribute('data-resume-title')   || 'Résumé';
            const caption = btn.getAttribute('data-resume-caption') || '';
            if (!src) return;
            openLightbox('pdf', src, title, caption);
        });
    });
})();
