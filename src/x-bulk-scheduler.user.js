// ==UserScript==
// @name         X Bulk Scheduler
// @namespace    x-bulk-scheduler
// @version      0.4.5
// @description  Harvest video links from bookmarks/likes/official promo posts, prune dead links, and hand them to X's native scheduler. Mobile-friendly (Firefox Android + Tampermonkey).
// @updateURL    https://raw.githubusercontent.com/eleven-smg/x-bulk-scheduler/main/src/x-bulk-scheduler.user.js
// @downloadURL  https://raw.githubusercontent.com/eleven-smg/x-bulk-scheduler/main/src/x-bulk-scheduler.user.js
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      publish.x.com
// @connect      publish.twitter.com
// @connect      cdn.syndication.twimg.com
// @run-at       document-idle
// ==/UserScript==

/*
 * STATUS: v0.4.0 — dry-run harvest confirmed on-device (11 links exported).
 * This build fixes what that run exposed:
 *  - Bookmarks/Likes moved to the unified History page (x.com/i/history[/likes]).
 *  - Wrapper links: a bookmarked/liked post that only EMBEDS another post's video
 *    now harvests the ORIGINAL status (DOM equivalent of Share → Post Video),
 *    so scheduled links are the live source, not a re-share that reads as dead.
 *  - Optional photo harvesting (panel "Photos" toggle, /photo/1 suffix).
 *  - Undo-last-harvest + Remove-by-link + Inspect (DOM dump) for bad links.
 * Picker MAPPED + implemented (native <select>s + Confirm on /compose/post/
 * schedule); timezone = WAT. Live posting still gated by CONFIG.dryRun (default
 * ON) — flip off only for the first confirmed 1-post live test. Delete tool
 * remains DRY-RUN scan only. See PROJECT.md / ROADMAP.md.
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------ CONFIG
  const CONFIG = {
    presets: {
      '12x4': { postsPerSession: 12, sessions: 4, sessionHours: 6, gapSeconds: 25 },
      '10x5': { postsPerSession: 10, sessions: 5, sessionHours: 5, gapSeconds: 30 },
    },
    active: '12x4',        // default preset; switch to '10x5' any time
    startTime: '00:00',     // first session each day, WAT (Nigeria, UTC+1)
    daysAhead: 1,           // how many days to schedule per run (queue-cap safety)
    appendVideoSuffix: true,// append /video/1 (or /photo/1) to harvested links
    harvestPhotos: false,   // also harvest photo posts (suffix /photo/1). Toggle
                            // from the panel's "Photos" button. OFF by default so
                            // video-only pages behave exactly as before.
    dryRun: true,           // TRUE = log actions only, never click final Confirm
    dailyCap: 48,           // stop scheduling past this many/day (free-tier ~50)
    useOembedCheck: false,  // Layer-2 dead-link ping. OFF: publish.x.com/oembed
                            // now returns 402 (paywalled) — see BUGS.md 2026-09-23.
                            // Tombstone detection (Layer 1) is the free primary.
    timezone: 'Africa/Lagos',
    // Search-harvest defaults (Phase: search). X search operators.
    search: {
      minFaves: 1000,       // only videos with >= this many likes
      onlyNativeVideo: true,// filter:native_video (skip link/quote posts)
      excludeReplies: true, // -filter:replies
      lang: '',             // e.g. 'en' or '' for any
    },
    // ALL X selectors live here so a UI change is a one-line fix.
    selectors: {
      article: 'article[data-testid="tweet"]',
      videoPlayer: '[data-testid="videoPlayer"], video, [data-testid="previewInterstitial"]',
      tweetPhoto: '[data-testid="tweetPhoto"]',
      statusLink: 'a[href*="/status/"]',
      composerBox: '[data-testid="tweetTextarea_0"]',
      scheduleButton: '[data-testid="scheduleOption"]',
      tweetButton: '[data-testid="tweetButton"]',
      // Schedule picker (mapped on-device 2026-09-26). Native <select>s on the
      // x.com/compose/post/schedule route. Primary = X's ids; a heuristic
      // fallback (findScheduleSelects) recovers them if the ids ever change.
      schedule: {
        month: '#SELECTOR_1', day: '#SELECTOR_2', year: '#SELECTOR_3',
        hour: '#SELECTOR_4', minute: '#SELECTOR_5', ampm: '#SELECTOR_6',
      },
    },
  };

  // Picker mapped on-device 2026-09-26 (native selects + Confirm). Live posting
  // is STILL gated by CONFIG.dryRun (default ON): flip that off only for the
  // one confirmed live test. Setting this true just means the DOM path exists.
  const SCHEDULER_MAPPED = true;

  // --------------------------------------------------------------- STORAGE
  const KEYS = { queue: 'xbs_queue', posted: 'xbs_posted_ids', log: 'xbs_log',
    captions: 'xbs_captions', delcand: 'xbs_delete_candidates',
    lasthv: 'xbs_last_harvest' };

  const store = {
    getQueue() { return JSON.parse(GM_getValue(KEYS.queue, '[]')); },
    setQueue(q) { GM_setValue(KEYS.queue, JSON.stringify(q)); },
    getPosted() { return new Set(JSON.parse(GM_getValue(KEYS.posted, '[]'))); },
    addPosted(id) {
      const s = this.getPosted(); s.add(id);
      GM_setValue(KEYS.posted, JSON.stringify([...s]));
    },
    // Persist a single item change immediately (idempotency / crash recovery).
    upsert(item) {
      const q = this.getQueue();
      const i = q.findIndex((x) => x.id === item.id);
      if (i >= 0) q[i] = item; else q.push(item);
      this.setQueue(q);
    },
  };

  // ------------------------------------------------------------------- LOG
  const logBuf = JSON.parse(GM_getValue(KEYS.log, '[]'));
  function log(msg, level) {
    const line = `[${new Date().toLocaleTimeString('en-GB')}] ${level || 'info'}: ${msg}`;
    logBuf.push(line);
    if (logBuf.length > 300) logBuf.shift();
    GM_setValue(KEYS.log, JSON.stringify(logBuf));
    const el = document.getElementById('xbs-log');
    if (el) { el.textContent = logBuf.slice(-40).join('\n'); el.scrollTop = el.scrollHeight; }
    console.log('[XBS]', line);
  }

  // ----------------------------------------------------------------- UTILS
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = (base, spread) => base + Math.floor(Math.random() * spread);

  function extractStatusId(href) {
    const m = href.match(/\/status\/(\d+)/);
    return m ? m[1] : null;
  }
  function buildUrl(id, author, mediaType) {
    const base = `https://x.com/${author || 'i'}/status/${id}`;
    if (!CONFIG.appendVideoSuffix) return base;
    if (mediaType === 'photo') return `${base}/photo/1`;
    if (mediaType === 'video') return `${base}/video/1`;
    return base;
  }

  // ------------------------------------------------------------- HARVESTER
  // X folded Bookmarks + Likes into one "History" page (2026): Bookmarks live at
  // x.com/i/history, Likes at x.com/i/history/likes. Legacy paths still mapped.
  function pageKind() {
    const p = location.pathname;
    if (/\/likes$/.test(p)) return 'likes';           // /i/history/likes or /<user>/likes
    if (p.startsWith('/i/history')) return 'bookmarks';
    if (p.startsWith('/i/bookmarks')) return 'bookmarks'; // legacy
    return 'other';
  }

  // A post's own permalink id: the timestamp (<time>) sits inside the canonical
  // status link. For a quoted/embedded post the FIRST <time> is the wrapper's own
  // (it renders above the embedded card), so this returns the wrapper id.
  function articleOwnId(art) {
    const t = art.querySelector('time');
    const a = (t && t.closest('a[href*="/status/"]')) || art.querySelector(CONFIG.selectors.statusLink);
    const href = a ? (a.getAttribute('href') || '') : '';
    const id = extractStatusId(href);
    const author = (href.match(/^\/([^/]+)\/status/) || [])[1] || null;
    return id ? { id, author } : null;
  }

  // What media the post shows.
  function mediaKind(art) {
    if (art.querySelector(CONFIG.selectors.videoPlayer)) return 'video';
    if (art.querySelector(CONFIG.selectors.tweetPhoto)) return 'photo';
    return null;
  }

  // The FIX for wrapper links: when you bookmark/like a post that only *embeds*
  // another post's video (your own "Post Video" re-share, or a quoted-link post),
  // the post's own permalink is a dead-ish wrapper — tapping it lands on your
  // re-share, not the source. X's "Share → Post Video" resolves the ORIGINAL.
  //
  // The DOM equivalent, in confidence order:
  //  (1) The video's "From <creator>" attribution badge — an <a> to /i/status/<id>
  //      (or /<user>/status/<id>). This is the exact thing "Post Video" copies, so
  //      when present it is authoritative. NOTE: X only renders this once the video
  //      component mounts (on the post's own page / when it plays); on the History
  //      feed the badge is usually absent — see BUGS.md 2026-09-26.
  //  (2) Fallback: exactly one embedded status link whose id differs from our own.
  //      0 other ids = a genuine original (keep it); >1 = ambiguous (keep wrapper).
  // Same-id links (analytics/photo) are ignored. author 'i' → unknown handle; we
  // keep the id and let x.com/i/status/<id> redirect to the canonical post.
  function resolveEmbeddedStatus(art, ownId) {
    const parse = (href) => {
      const m = (href || '').match(/^\/(?:([^/]+)\/)?(?:i\/)?status\/(\d+)/)
        || (href || '').match(/^\/([^/]+)\/status\/(\d+)/);
      if (!m) return null;
      const id = m[2] || m[1];               // guard against shape drift
      const author = (m[1] && m[1] !== 'i' && m[1] !== 'status') ? m[1] : null;
      return /^\d+$/.test(id) ? { id, author } : null;
    };
    // (1) Attribution badge first (highest confidence).
    const attr = art.querySelector(
      '[data-testid="socialContext"] a[href*="/status/"], a[href^="/i/status/"]');
    if (attr) {
      const p = parse(attr.getAttribute('href') || '');
      if (p && p.id !== ownId) return p;
    }
    // (2) Fallback heuristic.
    const ids = new Map(); // id -> author
    art.querySelectorAll('a[href*="/status/"]').forEach((a) => {
      const p = parse(a.getAttribute('href') || '');
      if (!p || p.id === ownId) return;
      if (!ids.has(p.id)) ids.set(p.id, p.author);
    });
    if (ids.size !== 1) return null;
    const [id, author] = [...ids.entries()][0];
    return { id, author };
  }

  // A post is a video post if it renders a video/player element.
  function isVideoPost(article) {
    return !!article.querySelector(CONFIG.selectors.videoPlayer);
  }

  // Dead posts render as "tombstones" with no media and unavailable text.
  const TOMBSTONE_RE = /(this post was deleted|this post is unavailable|no longer exists|account.*suspended)/i;
  function isTombstone(article) {
    return !isVideoPost(article) && TOMBSTONE_RE.test(article.innerText || '');
  }

  function collectFromView(source, seen, out, stats) {
    stats.domArticles = Math.max(stats.domArticles,
      document.querySelectorAll(CONFIG.selectors.article).length);
    document.querySelectorAll(CONFIG.selectors.article).forEach((art) => {
      if (stats.queued >= stats.cap) return;              // target N reached — stop
      const own = articleOwnId(art);
      if (!own || !own.id) { stats.noId++; return; }
      if (seen.has(own.id)) { stats.alreadyHad++; return; } // posted/queued/handled
      seen.add(own.id);
      stats.scanned++;
      if (isTombstone(art)) { stats.tombstone++; log(`tombstone skipped ${own.id}`, 'warn'); return; }
      const mk = mediaKind(art);
      if (!mk) { stats.noMedia++; return; }               // no video/photo media
      if (mk === 'photo' && !CONFIG.harvestPhotos) { stats.photoSkip++; return; } // opt-in
      // Prefer the embedded ORIGINAL over a wrapper re-share (see above).
      const embed = resolveEmbeddedStatus(art, own.id);
      const finalId = embed ? embed.id : own.id;
      const finalAuthor = embed ? embed.author : own.author;
      if (finalId !== own.id && seen.has(finalId)) return; // original already taken
      seen.add(finalId);
      if (embed) { stats.resolved++; log(`resolved original ${finalId} (was wrapper ${own.id})`); }
      stats.queued++;
      out.push({
        id: finalId,
        url: buildUrl(finalId, finalAuthor, mk),
        kind: 'link',
        media: mk,
        wrapperId: embed ? own.id : null,
        source,
        state: 'queued',
        day: 0, session: 0, slot: 0,
        scheduledAt: null,
        harvestedAt: new Date().toISOString(),
        errors: [],
      });
    });
  }

  // Harvest is RESUME-AWARE. The dedupe set (everything already queued/posted) is
  // the checkpoint — nothing is ever re-queued. Two modes, chosen by targetN:
  //   • targetN 0 / blank  → "new only": collect from the top and STOP at the first
  //     screen that's entirely already-harvested. New bookmarks/likes always sit at
  //     the very top, so a known screen means we've caught up. Cheapest everyday run.
  //   • targetN = N        → "next N": fast-forward past everything already harvested
  //     (short scroll pauses, no processing), then collect N genuinely-new posts from
  //     the backlog frontier downward and stop. This is "harvest the next 100/200".
  // NOTE (honest limit): X's feed is virtualised — there is no way to jump to post
  // #101, you must scroll through the earlier ones. Fast-forward makes that cheap
  // (short pauses, skipped processing) but it still loads them. The permanent fix
  // for the backlog is unbookmark-after-post (roadmap), which drops done posts off
  // the list so the top is always the frontier. Likes can't be pruned non-destructively.
  async function harvest(targetN) {
    const kind = pageKind();
    if (kind === 'other') {
      log('Open History → Bookmarks (x.com/i/history) or Likes (x.com/i/history/likes), then tap Harvest.', 'warn');
      return;
    }
    const target = Number(targetN) > 0 ? Number(targetN) : 0;
    log(`Harvesting ${target ? 'next ' + target : 'new'} from ${kind}…`);
    const posted = store.getPosted();
    const existing = new Set(store.getQueue().map((x) => x.id));
    const seen = new Set([...posted, ...existing]);
    const hadBacklog = seen.size > 0;
    const found = [];
    const stats = { domArticles: 0, scanned: 0, noId: 0, tombstone: 0,
      noMedia: 0, photoSkip: 0, resolved: 0, queued: 0, alreadyHad: 0,
      cap: target > 0 ? target : Infinity };
    let lastH = 0, stable = 0, prevQ = 0, knownStreak = 0;
    // Auto-scroll — Data Saver on. Stop at target, or when the page stops growing.
    while (stable < 3 && stats.queued < stats.cap) {
      collectFromView(kind, seen, found, stats);
      const gotNew = stats.queued - prevQ; prevQ = stats.queued;
      // "New only" mode: once we hit a couple of all-already-harvested screens in a
      // row, we've caught up to last time — stop instead of re-scrolling the backlog.
      if (!target && hadBacklog) {
        if (gotNew === 0 && stats.alreadyHad > 0) { if (++knownStreak >= 2) break; }
        else knownStreak = 0;
      }
      window.scrollBy(0, window.innerHeight * 0.9);
      // Fast-forward: a screen with nothing new is scrolled past quickly (save data);
      // a screen with fresh posts gets the full pause so media/links render first.
      await sleep(gotNew === 0 && stats.domArticles > 0 ? jitter(250, 200) : jitter(900, 500));
      if (document.body.scrollHeight === lastH) stable++; else { stable = 0; lastH = document.body.scrollHeight; }
    }
    found.forEach((it) => store.upsert(it));
    // Remember this batch so it can be undone in one tap if links look wrong.
    GM_setValue(KEYS.lasthv, JSON.stringify({
      at: new Date().toISOString(), source: kind, ids: found.map((x) => x.id),
    }));
    const hitTarget = target && stats.queued >= stats.cap ? ` (hit target ${target})` : '';
    log(`Harvest done: ${found.length} new ${kind} link(s) queued${hitTarget}.`);
    log(`  scan — posts on page:${stats.domArticles} new:${stats.scanned} `
      + `skipped-known:${stats.alreadyHad} noMedia:${stats.noMedia} `
      + `photosOff:${stats.photoSkip} tombstone:${stats.tombstone} resolved:${stats.resolved}`);
    if (!found.length) {
      if (stats.domArticles === 0) log('  ↳ 0 posts on page — you are NOT on the History/Likes list (or it hasn\'t loaded). Scroll once, then Harvest.', 'warn');
      else if (stats.scanned === 0 && stats.alreadyHad > 0) log('  ↳ all visible posts were already harvested. Type a number (e.g. 100) in the box next to Harvest to fast-forward past them into older posts.', 'warn');
      else if (stats.photoSkip > 0 && stats.noMedia === 0) log('  ↳ all matches were photos — tap Photos to turn photo harvesting ON.', 'warn');
      else log('  ↳ posts seen but none had detectable video/photo media.', 'warn');
    }
  }

  // --------------------------------------------------- HARVEST MAINTENANCE
  // Remove a bad harvest without wiping the whole queue.
  // Undo the LAST harvest batch (only items still 'queued' — never touches
  // anything already scheduled/posted).
  function undoLastHarvest() {
    const last = JSON.parse(GM_getValue(KEYS.lasthv, '{"ids":[]}'));
    if (!last.ids || !last.ids.length) { log('No recorded last harvest to undo.', 'warn'); return; }
    const ids = new Set(last.ids);
    const q = store.getQueue();
    const kept = q.filter((x) => !(ids.has(x.id) && x.state === 'queued'));
    const removed = q.length - kept.length;
    store.setQueue(kept);
    GM_setValue(KEYS.lasthv, JSON.stringify({ at: new Date().toISOString(), source: last.source, ids: [] }));
    log(`Undo harvest: removed ${removed} queued item(s) from the last ${last.source || ''} batch.`);
  }

  // Remove one item by pasted status URL or bare id (accepts wrapper or original).
  function removeItem(term) {
    if (!term) return;
    const id = extractStatusId(String(term)) || String(term).trim();
    const q = store.getQueue();
    const kept = q.filter((x) => x.id !== id && x.wrapperId !== id && !(x.url || '').includes(id));
    const removed = q.length - kept.length;
    store.setQueue(kept);
    log(removed ? `Removed ${removed} item(s) matching "${id}".` : `No queue item matched "${id}".`);
  }

  // Wipe only 'queued' items (never scheduled/posted) — for a clean re-harvest.
  function clearQueued() {
    const q = store.getQueue();
    const kept = q.filter((x) => x.state !== 'queued');
    const removed = q.length - kept.length;
    store.setQueue(kept);
    GM_setValue(KEYS.lasthv, JSON.stringify({ at: new Date().toISOString(), source: null, ids: [] }));
    log(`Cleared ${removed} queued item(s). Scheduled/posted kept.`);
  }

  // Read-only DOM dump of the first few posts in the current view: own id, every
  // status link, media flags, and any "From <name>" attribution. If a harvested
  // link still points at a wrapper instead of the original, tap this on the
  // Likes/Bookmarks page and send xbs-inspect.json so the selector can be tuned.
  function inspectView() {
    const arts = [...document.querySelectorAll(CONFIG.selectors.article)].slice(0, 5);
    const articles = arts.map((art, i) => {
      const own = articleOwnId(art);
      // Every /status/ href (own, embedded original, analytics…).
      const statusLinks = [...art.querySelectorAll('a[href*="/status/"]')]
        .map((a) => a.getAttribute('href')).filter(Boolean).slice(0, 16);
      // The video "From <creator>" attribution — the authoritative original link,
      // but X only mounts it once the player renders. Capture it AND note presence.
      const socialCtx = [...art.querySelectorAll('[data-testid="socialContext"]')]
        .map((e) => ({ text: (e.textContent || '').trim().slice(0, 50),
          hrefs: [...e.querySelectorAll('a')].map((a) => a.getAttribute('href')) }));
      const attribution = [...art.querySelectorAll('span, div, a')]
        .filter((e) => /^From\s/i.test((e.textContent || '').trim()) && e.children.length <= 4)
        .slice(0, 3)
        .map((e) => ({ text: e.textContent.trim().slice(0, 50),
          hrefs: [...e.querySelectorAll('a')].map((a) => a.getAttribute('href')) }));
      // Bare-link / quoted-URL re-shares: the unfurled card points at the source.
      const card = art.querySelector('[data-testid="card.wrapper"], [data-testid="card.layoutLarge.media"]');
      const cardLinks = card ? [...card.querySelectorAll('a')]
        .map((a) => a.getAttribute('href')).filter(Boolean).slice(0, 6) : [];
      // What resolveEmbeddedStatus would decide for this post, right now.
      const resolved = own && own.id ? resolveEmbeddedStatus(art, own.id) : null;
      const text = (art.querySelector('[data-testid="tweetText"]') || {}).textContent || '';
      return { i, ownId: own && own.id, ownAuthor: own && own.author,
        media: { video: isVideoPost(art), photo: !!art.querySelector(CONFIG.selectors.tweetPhoto) },
        text: text.trim().slice(0, 80),
        wouldResolveTo: resolved,   // null = keeps own id (looks native)
        socialCtx, attribution, cardLinks, statusLinks };
    });
    const res = { at: new Date().toISOString(), url: location.href, articles };
    console.log('[XBS] XBS_INSPECT=' + JSON.stringify(res));
    try {
      const u = URL.createObjectURL(new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = u; a.download = 'xbs-inspect.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
    } catch (e) { /* console copy is enough */ }
    log(`Inspect: dumped ${articles.length} post(s) → xbs-inspect.json.`);
  }

  // ------------------------------------------------- DEAD-LINK CHECK (oEmbed)
  // Layer 2: ping oEmbed; dead posts historically returned 404. No API key.
  // 2026-09-23: publish.x.com/oembed now returns 402 (paywalled) to our tests,
  // so this is OFF by default (CONFIG.useOembedCheck). Layer 1 (tombstone during
  // harvest) is the free primary check. Re-verify from a logged-in browser in
  // DESKTOP-TESTING.md; if it works there, flip useOembedCheck on.
  function oembedCheck(id, author) {
    return new Promise((resolve) => {
      if (!CONFIG.useOembedCheck) { resolve(true); return; } // skip → treat alive
      const bare = `https://x.com/${author || 'i'}/status/${id}`; // no /video/1
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://publish.x.com/oembed?url=${encodeURIComponent(bare)}`,
        timeout: 8000,
        // 404 = dead. 402/others = inconclusive → don't falsely kill it.
        onload: (r) => resolve(r.status !== 404),
        onerror: () => resolve(true),
        ontimeout: () => resolve(true),
      });
    });
  }

  // ---------------------------------------------- WRAPPER → ORIGINAL (syndication)
  // The History feed does NOT expose the embedded original (BUGS.md 2026-09-26 —
  // the "From <creator>" badge only mounts on the post's own page). So we resolve
  // wrapper → original per-post from X's own free, no-auth embed data:
  //   cdn.syndication.twimg.com/tweet-result?id=<ID>&token=<t>   (react-tweet's API)
  // GM_xmlhttpRequest runs OUTSIDE page CSP, so this is not blocked like a page
  // fetch. Returns {id, author} of the ORIGINAL when the post re-shares/quotes
  // another tweet (or its video is sourced from one), else null (native post).
  function synToken(id) {
    // Well-known react-tweet token derivation ( .toString(6**2) === base 36 ).
    return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
  }
  function synFetch(id) {
    const url = `https://cdn.syndication.twimg.com/tweet-result?id=${id}`
      + `&lang=en&token=${synToken(id)}`;
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET', url, timeout: 9000, headers: { Accept: 'application/json' },
        onload: (r) => { try { resolve(r.status === 200 ? JSON.parse(r.responseText) : null); }
          catch (e) { resolve(null); } },
        onerror: () => resolve(null), ontimeout: () => resolve(null),
      });
    });
  }
  // Dig the original (id + handle) out of a syndication tweet object.
  function originalFromSyndication(d, wrapperId) {
    if (!d || typeof d !== 'object') return null;
    const pick = (id, author) => (id && /^\d+$/.test(String(id)) && String(id) !== wrapperId)
      ? { id: String(id), author: author || null } : null;
    // 1) Quote / retweet of another post — what Share → "Post Video" creates.
    const q = d.quoted_tweet || d.retweeted_status;
    let hit = q && pick(q.id_str || q.id, q.user && q.user.screen_name);
    if (hit) return hit;
    // 2) Re-shared video: the media entity carries its SOURCE tweet.
    const media = (d.mediaDetails || [])
      .concat((d.extended_entities && d.extended_entities.media) || [])
      .concat((d.entities && d.entities.media) || []);
    for (const m of media) {
      const su = (m.additional_media_info && m.additional_media_info.source_user)
        || m.source_user;
      hit = pick(m.source_status_id_str, su && su.screen_name);
      if (hit) return hit;
    }
    return null;
  }

  // One-tap pass over queued VIDEO links: ask X's embed data whether each is a
  // re-share and, if so, rewrite it to the ORIGINAL poster's link. Idempotent —
  // each item is checked once (resolvedVia stamp), so re-tapping is cheap. Gentle
  // ~0.5s spacing keeps it low-data and unobtrusive. Native posts are left as-is.
  async function resolveQueueLinks() {
    if (RESOLVING) { log('Fix Links already running.', 'warn'); return; }
    RESOLVING = true;
    try {
      const q = store.getQueue();
      const targets = q.filter((x) => (x.kind || 'link') === 'link' && x.media === 'video'
        && x.state === 'queued' && !x.resolvedVia);
      if (!targets.length) { log('Fix Links: nothing new to check (video links, once each).', 'warn'); return; }
      log(`Fix Links: checking ${targets.length} video link(s) via X embed data…`);
      let fixed = 0, native = 0, failed = 0;
      for (const item of targets) {
        if (!RESOLVING) { log('Fix Links stopped.', 'warn'); break; }
        const checkId = item.wrapperId || item.id;   // the id as it sits on X
        const d = await synFetch(checkId);
        if (d === null) { failed++; await sleep(jitter(500, 400)); continue; }
        const orig = originalFromSyndication(d, checkId);
        if (orig && orig.id !== item.id) {
          item.wrapperId = item.wrapperId || item.id;
          item.id = orig.id;
          item.url = buildUrl(orig.id, orig.author, item.media);
          item.resolvedVia = 'syndication'; fixed++;
          log(`  fixed wrapper ${item.wrapperId} → original ${orig.id}${orig.author ? ' (@' + orig.author + ')' : ''}`);
        } else { item.resolvedVia = 'native'; native++; }
        await sleep(jitter(500, 400));
      }
      // De-dupe (two wrappers can share one original), then persist once.
      const byId = new Map();
      for (const it of q) if (!byId.has(it.id)) byId.set(it.id, it);
      store.setQueue([...byId.values()]);
      log(`Fix Links done: ${fixed} rewritten to original, ${native} native/kept, ${failed} unresolved. Queue now ${byId.size}.`);
    } finally { RESOLVING = false; }
  }

  // ------------------------------------------------------------- SHUFFLE
  // Mixes the un-posted pool so the posting timeline is varied instead of
  // running in harvest order (where the same account/batch sits back-to-back).
  // Only 'queued' items are touched — anything already scheduled/posted/dead is
  // left where it is. Build reads the 'queued' items IN ARRAY ORDER, so simply
  // reordering them here decides the posting order.
  //
  // A uniform Fisher-Yates shuffle is exactly the "spread across the whole pool"
  // the owner asked for: after it, any run of ~10 in the new order is a random
  // sample from the entire pool (e.g. 1, 15, 23, 37, 42… — never the 1,11,21…
  // fixed stride, and never a single clumped batch). A second best-effort pass
  // then nudges apart any two neighbours from the SAME account so you don't post
  // the same creator twice in a row.
  const authorOf = (x) =>
    (String(x.url || '').match(/(?:x|twitter)\.com\/([^/]+)\/status/) || [])[1] ||
    x.source || '';

  function spreadSameAuthor(a) {
    // Pure swaps only — never adds or drops an item.
    for (let i = 1; i < a.length; i++) {
      if (authorOf(a[i]) !== authorOf(a[i - 1])) continue;
      let swap = -1;
      for (let k = i + 1; k < a.length; k++) {
        if (authorOf(a[k]) !== authorOf(a[i - 1])) { swap = k; break; }
      }
      if (swap > -1) { const t = a[i]; a[i] = a[swap]; a[swap] = t; }
    }
  }

  function shuffleQueue() {
    const q = store.getQueue();
    const pool = q.filter((x) => x.state === 'queued');
    const rest = q.filter((x) => x.state !== 'queued');
    if (pool.length < 2) { log('Nothing to shuffle — need 2+ un-posted links in the pool.', 'warn'); return; }
    // Fisher-Yates over the un-posted pool.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    spreadSameAuthor(pool);
    // A re-shuffle invalidates any schedule already stamped — clear it so Build
    // re-lays the whole pool in the new order.
    pool.forEach((x) => { x.scheduledAt = null; x.day = 0; x.session = 0; x.slot = 0; });
    store.setQueue([...rest, ...pool]);
    log(`Shuffled ${pool.length} un-posted link(s) into a mixed order. Tap Build to re-schedule.`);
  }

  // --------------------------------------------------------- SCHEDULE (math)
  // Pure, local, no DOM, no network. Splits queued items into day/session/slot
  // and stamps each with a WAT timestamp. Idempotent: re-runnable any time.
  function buildSchedule() {
    const p = CONFIG.presets[CONFIG.active];
    const perDay = p.postsPerSession * p.sessions;
    const queue = store.getQueue().filter((x) => x.state === 'queued');
    if (!queue.length) { log('Nothing queued to schedule.', 'warn'); return; }

    const [sh, sm] = CONFIG.startTime.split(':').map(Number);
    let n = 0;
    const cap = Math.min(queue.length, CONFIG.daysAhead * perDay, CONFIG.dailyCap * CONFIG.daysAhead);
    for (let i = 0; i < cap; i++) {
      const item = queue[i];
      const day = Math.floor(n / perDay);
      const within = n % perDay;
      const session = Math.floor(within / p.postsPerSession);
      const slot = within % p.postsPerSession;

      const d = new Date();
      d.setDate(d.getDate() + day);
      d.setHours(sh, sm, 0, 0);
      // session offset + per-slot gap (jittered spacing handled at run time)
      d.setHours(d.getHours() + session * p.sessionHours);
      d.setSeconds(d.getSeconds() + slot * p.gapSeconds);

      item.day = day; item.session = session; item.slot = slot;
      item.scheduledAt = d.toISOString();
      store.upsert(item);
      n++;
    }
    log(`Schedule built: ${cap} posts across ${Math.ceil(cap / perDay)} day(s), ${CONFIG.active}.`);
  }

  // ---------------------------------------------------- COMPOSER INSERT
  // Draft.js contenteditable: el.value fails. Try execCommand, then a native
  // InputEvent fallback. Final method is confirmed by TESTING.md Check 1.
  function insertIntoComposer(box, text) {
    box.focus();
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok || !(box.innerText || '').includes(text)) {
      box.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertText', data: text, bubbles: true, cancelable: true,
      }));
      box.dispatchEvent(new InputEvent('input', {
        inputType: 'insertText', data: text, bubbles: true,
      }));
    }
    return (box.innerText || '').includes(text);
  }

  // ------------------------------------------------- SCHEDULE PICKER (DOM)
  // Mapped on-device 2026-09-26: the picker is native <select>s on the
  // /compose/post/schedule route (Month/Day/Year/Hour/Minute/AM-PM) + Confirm.
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const pad2 = (n) => String(n).padStart(2, '0');

  // React tracks <select> value on the instance; use the prototype setter then
  // fire input+change so React's onChange sees it.
  function setNativeSelect(sel, value) {
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    desc.set.call(sel, value);
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Pick the option whose visible text equals `text`, or (fallback) whose
  // numeric value equals Number(text). Sets it via the React-safe setter.
  function selectOption(sel, text) {
    const want = String(text);
    let opt = [...sel.options].find((o) => o.textContent.trim() === want);
    if (!opt) opt = [...sel.options].find((o) => Number(o.textContent) === Number(want));
    if (!opt) return false;
    setNativeSelect(sel, opt.value);
    return true;
  }

  const optMax = (sel) => Math.max(...[...sel.options].map((o) => Number(o.textContent) || 0));

  // Resolve the 6 selects. Prefer X's ids; if those miss, classify by option
  // signature so a future id change doesn't break scheduling.
  function findScheduleSelects() {
    const S = CONFIG.selectors.schedule;
    const byId = {
      month: document.querySelector(S.month), day: document.querySelector(S.day),
      year: document.querySelector(S.year), hour: document.querySelector(S.hour),
      minute: document.querySelector(S.minute), ampm: document.querySelector(S.ampm),
    };
    if (Object.values(byId).every(Boolean)) return byId;
    const sels = [...document.querySelectorAll('select')];
    const out = { month: null, day: null, year: null, hour: null, minute: null, ampm: null };
    sels.forEach((s) => {
      const texts = [...s.options].map((o) => o.textContent.trim());
      if (texts.includes('December')) out.month = s;
      else if (texts.includes('AM') || texts.includes('PM')) out.ampm = s;
      else if (texts.some((t) => /^20\d\d$/.test(t))) out.year = s;
      else if (optMax(s) >= 32) out.minute = s;
      else if (optMax(s) <= 12) out.hour = s;
      else out.day = s;
    });
    return out;
  }

  // Find a clickable element by exact visible text (e.g. "Confirm").
  function findByText(text) {
    return [...document.querySelectorAll('[role="button"], button, [data-testid]')]
      .find((el) => (el.textContent || '').trim() === text) || null;
  }

  // Open the picker (if needed), set all six selects to the WAT wall-clock time
  // of whenISO, then click Confirm. The device is on WAT and the picker is WAT,
  // so local getters map 1:1 (verified Check 3). Throws on any missing field.
  async function setSchedulePicker(whenISO) {
    if (!SCHEDULER_MAPPED) throw new Error('Schedule picker not mapped.');
    const d = new Date(whenISO);
    // Open the schedule route if the selects aren't already present.
    if (!document.querySelector(CONFIG.selectors.schedule.month)) {
      const btn = document.querySelector(CONFIG.selectors.scheduleButton);
      if (!btn) throw new Error('schedule button not found');
      btn.click();
      for (let i = 0; i < 20 && !document.querySelector('select'); i++) await sleep(150);
    }
    const s = findScheduleSelects();
    const missing = Object.entries(s).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) throw new Error('picker fields missing: ' + missing.join(','));

    const hour12 = ((d.getHours() + 11) % 12) + 1;
    const ampm = d.getHours() < 12 ? 'AM' : 'PM';
    // Set year+month first so the day option list matches that month, then day.
    const steps = [
      [s.year, d.getFullYear()], [s.month, MONTHS[d.getMonth()]], [s.day, d.getDate()],
      [s.hour, hour12], [s.minute, pad2(d.getMinutes())], [s.ampm, ampm],
    ];
    for (const [sel, val] of steps) {
      if (!selectOption(sel, val)) throw new Error(`could not set ${val} on a picker select`);
      await sleep(120);
    }
    const confirm = findByText('Confirm');
    if (!confirm) throw new Error('Confirm button not found');
    confirm.click();
    await sleep(jitter(800, 500));
    return true;
  }

  async function schedulePost(item) {
    const text = item.text || item.url;   // caption items carry .text, links .url
    log(`${CONFIG.dryRun ? '[dryRun] ' : ''}scheduling ${item.kind || 'link'} ${item.id} for ${item.scheduledAt}`);
    if (CONFIG.dryRun) { item.state = 'scheduled'; store.upsert(item); return true; }
    if (!SCHEDULER_MAPPED) { log('Live run blocked: run TESTING.md first.', 'warn'); return false; }
    // Live path (enabled only after tests) --------------------------------
    location.assign('https://x.com/compose/post');
    await sleep(jitter(2500, 1500));
    const box = document.querySelector(CONFIG.selectors.composerBox);
    if (!box) { item.errors.push('composer not found'); item.state = 'rejected'; store.upsert(item); return false; }
    if (!insertIntoComposer(box, text)) { item.errors.push('insert failed'); item.state = 'rejected'; store.upsert(item); return false; }
    try { await setSchedulePicker(item.scheduledAt); } catch (e) { item.errors.push(String(e)); item.state = 'rejected'; store.upsert(item); return false; }
    // Submit the scheduled post via the composer's Post/Schedule button.
    const submit = document.querySelector(CONFIG.selectors.tweetButton);
    if (!submit) { item.errors.push('submit button not found'); item.state = 'rejected'; store.upsert(item); return false; }
    if (submit.getAttribute('aria-disabled') === 'true' || submit.disabled) {
      item.errors.push('submit disabled (possible queue ceiling)'); item.state = 'rejected'; store.upsert(item); return false;
    }
    submit.click();
    await sleep(jitter(2500, 1500));
    // Basic success check: composer closed. TODO(first live run): also confirm
    // the item appears in Unsent Posts before unbookmarking (trickled).
    if (document.querySelector(CONFIG.selectors.composerBox)) {
      item.errors.push('composer still open after submit — not confirmed'); item.state = 'rejected'; store.upsert(item); return false;
    }
    item.state = 'scheduled'; store.upsert(item); return true;
  }

  // ------------------------------------------------------------ ORCHESTRATE
  let RUNNING = false;
  let RESOLVING = false;

  async function runSchedule() {
    if (RUNNING) { log('Already running.', 'warn'); return; }
    RUNNING = true;
    try {
      const items = store.getQueue()
        .filter((x) => x.state === 'queued' && x.scheduledAt)
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
      if (!items.length) { log('Nothing to run — tap Build first.', 'warn'); return; }
      log(`${CONFIG.dryRun ? '[dryRun] ' : ''}running ${items.length} posts…`);
      for (const item of items) {
        if (!RUNNING) { log('Stopped.', 'warn'); break; }
        // Layer 2 dead-link check right before scheduling — link items only.
        if ((item.kind || 'link') === 'link' && item.url) {
          const author = (item.url.match(/x\.com\/([^/]+)\/status/) || [])[1];
          const alive = await oembedCheck(item.id, author);
          if (!alive) { item.state = 'dead'; store.upsert(item); log(`dead, skipped ${item.id}`, 'warn'); continue; }
        }
        await schedulePost(item);
        await sleep(jitter(1500, 1500)); // trickle writes, human-ish
      }
      log('Run complete.');
    } finally { RUNNING = false; }
  }

  function panic() {
    RUNNING = false;
    RESOLVING = false;
    log('PANIC: run halted. In-flight items left as-is.', 'warn');
  }

  function statusSummary() {
    const q = store.getQueue();
    const by = (s) => q.filter((x) => x.state === s).length;
    return `queued:${by('queued')} scheduled:${by('scheduled')} posted:${by('posted')} dead:${by('dead')} rejected:${by('rejected')} | preset:${CONFIG.active} dryRun:${CONFIG.dryRun}`;
  }

  // -------------------------------------------------------- CAPTION ENGINE
  // A local caption pool. captions-only scheduling picks captions with no
  // repeat until the pool is exhausted, then reshuffles. Pure text posts.
  const captions = {
    all() { return JSON.parse(GM_getValue(KEYS.captions, '{"pool":[],"used":[]}')); },
    save(c) { GM_setValue(KEYS.captions, JSON.stringify(c)); },
    add(lines) {
      const c = this.all();
      const set = new Set(c.pool);
      lines.map((s) => s.trim()).filter(Boolean).forEach((s) => set.add(s));
      c.pool = [...set];
      this.save(c);
      return c.pool.length;
    },
    // Non-repeating pick: draw from pool minus used; reshuffle when exhausted.
    next() {
      const c = this.all();
      if (!c.pool.length) return null;
      let avail = c.pool.filter((s) => !c.used.includes(s));
      if (!avail.length) { c.used = []; avail = c.pool.slice(); } // exhausted → reshuffle
      const pick = avail[Math.floor(Math.random() * avail.length)];
      c.used.push(pick);
      this.save(c);
      return pick;
    },
  };

  // Queue N caption-only items (kind:'caption', no url) then stamp times via
  // the same buildSchedule() slotting. captions-only mode == this + Run.
  function buildCaptionSchedule(n) {
    const pool = captions.all().pool;
    if (!pool.length) { log('Caption pool empty — add captions first.', 'warn'); return; }
    const count = Math.max(1, Number(n) || 0);
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const text = captions.next();
      if (!text) break;
      store.upsert({
        id: `cap_${now}_${i}`,
        kind: 'caption', text,
        source: 'caption', state: 'queued',
        day: 0, session: 0, slot: 0,
        scheduledAt: null,
        harvestedAt: new Date().toISOString(),
        errors: [],
      });
    }
    log(`Queued ${count} caption post(s). Tap Build to stamp times, then Run.`);
    buildSchedule();
  }

  // ------------------------------------------------- SHARED POOL (export/import)
  // Zero-cost backup + cross-account sharing via a local JSON file. Storage is
  // per browser profile, so this is the manual bridge between accounts. The
  // per-profile `posted` set is the automatic per-account "used" tracking, so
  // importing a pool into account B never double-posts what B already sent.
  function exportQueue() {
    const blob = {
      exportedAt: new Date().toISOString(),
      queue: store.getQueue(),
      posted: [...store.getPosted()],
      captions: captions.all(),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(blob, null, 2)],
      { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `xbs-pool-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    log(`Exported ${blob.queue.length} item(s) + ${blob.posted.length} posted id(s).`);
  }

  function importQueue() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.addEventListener('change', () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const posted = store.getPosted();       // this account's used-tracking
          const q = store.getQueue();
          const byId = new Map(q.map((x) => [x.id, x]));
          let added = 0, skipped = 0;
          (data.queue || []).forEach((it) => {
            if (posted.has(it.id)) { skipped++; return; } // already posted here
            if (byId.has(it.id)) { skipped++; return; }    // already queued here
            // reset scheduling for this account; keep source/kind/text/url.
            byId.set(it.id, { ...it, state: 'queued', day: 0, session: 0, slot: 0,
              scheduledAt: null, errors: [] });
            added++;
          });
          store.setQueue([...byId.values()]);
          if (data.captions && Array.isArray(data.captions.pool)) captions.add(data.captions.pool);
          log(`Imported: ${added} new, ${skipped} skipped (already posted/queued here).`);
          log(statusSummary());
        } catch (e) { log(`Import failed: ${e}`, 'warn'); }
      };
      reader.readAsText(file);
    });
    inp.click();
  }

  // -------------------------------------------------- DELETE TOOL (dry-run scan)
  // SCANS ONLY. Never deletes. Lists what a given rule WOULD delete so the
  // owner can confirm before any live delete is ever built (Phase 3, gated).
  // Run this on your OWN profile page (x.com/<yourhandle>).
  const DELETE_RULES = ['all', 'firstN', 'pastWeek', 'linkDeadEmbed', 'liveMedia'];
  const EMBED_DEAD_RE = /(this post is unavailable|this post was deleted|no longer exists|account.*suspended)/i;

  function classifyForDelete(art, rule, firstN, count) {
    const hasMedia = isVideoPost(art) || !!art.querySelector('[data-testid="tweetPhoto"]');
    // A quoted/embedded status card inside this post.
    const embed = art.querySelector('[role="link"] a[href*="/status/"], [aria-labelledby] a[href*="/status/"]');
    const embedDead = EMBED_DEAD_RE.test(art.innerText || '') && !hasMedia;
    const t = art.querySelector('time');
    const ts = t ? Date.parse(t.getAttribute('datetime')) : NaN;
    const weekMs = 7 * 24 * 3600 * 1000;
    switch (rule) {
      case 'all': return 'all';
      case 'firstN': return count < firstN ? `first ${firstN}` : null;
      case 'pastWeek': return (!isNaN(ts) && Date.now() - ts <= weekMs) ? 'past 7 days' : null;
      case 'linkDeadEmbed': return (embed && embedDead) ? 'link-only, embed dead' : null;
      case 'liveMedia': return hasMedia ? 'has own media' : null;
      default: return null;
    }
  }

  async function deleteScan(rule, firstN) {
    if (!DELETE_RULES.includes(rule)) { log(`Unknown delete rule: ${rule}`, 'warn'); return; }
    const handle = (location.pathname.match(/^\/([^/]+)\/?$/) || [])[1];
    if (!handle) { log('Open your OWN profile page first, then scan.', 'warn'); return; }
    log(`[dry-run] scanning "${handle}" for rule: ${rule}${rule === 'firstN' ? ` (N=${firstN || 100})` : ''}…`);
    const seen = new Set(); const candidates = []; const N = Number(firstN) || 100;
    let lastH = 0, stable = 0, count = 0;
    while (stable < 3) {
      document.querySelectorAll(CONFIG.selectors.article).forEach((art) => {
        const link = art.querySelector(CONFIG.selectors.statusLink);
        const id = link && extractStatusId(link.getAttribute('href') || '');
        if (!id || seen.has(id)) return;
        seen.add(id);
        const reason = classifyForDelete(art, rule, N, count);
        count++;
        if (reason) candidates.push({ id, url: `https://x.com/${handle}/status/${id}`, reason });
      });
      if (rule === 'firstN' && count >= N) break;
      window.scrollBy(0, window.innerHeight * 0.9);
      await sleep(jitter(900, 500));
      if (document.body.scrollHeight === lastH) stable++; else { stable = 0; lastH = document.body.scrollHeight; }
    }
    GM_setValue(KEYS.delcand, JSON.stringify({ rule, handle, at: new Date().toISOString(), candidates }));
    log(`[dry-run] ${candidates.length} post(s) MATCH rule "${rule}". Nothing deleted.`);
    candidates.slice(0, 8).forEach((c) => log(`  would delete ${c.id} — ${c.reason}`));
    if (candidates.length > 8) log(`  …and ${candidates.length - 8} more (saved to storage).`);
  }

  // ------------------------------------------------------------ DIAGNOSTIC PROBE
  // One-tap on-device version of DESKTOP-TESTING Checks 1, 2, 5. Read-only:
  // inserts throwaway text, opens (then you close) the schedule dialog, pings
  // oEmbed. Makes NO post. Open x.com/compose/post logged in, then tap Probe;
  // it downloads xbs-probe.json to send back.
  function gmGet(url) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({ method: 'GET', url, timeout: 8000,
        onload: (r) => resolve({ status: r.status, body: (r.responseText || '').slice(0, 200) }),
        onerror: () => resolve({ status: 'error', body: '' }),
        ontimeout: () => resolve({ status: 'timeout', body: '' }) });
    });
  }

  async function probe() {
    const res = { at: new Date().toISOString(), url: location.href };
    const box = document.querySelector(CONFIG.selectors.composerBox);
    if (!box) { log('Probe: open x.com/compose/post first, then tap Probe.', 'warn'); return; }
    try {
      box.focus();
      const okExec = document.execCommand('insertText', false, 'XBS-PROBE');
      res.check1 = { okExec, contains: (box.innerText || '').includes('XBS-PROBE') };
    } catch (e) { res.check1 = { error: String(e) }; }
    try {
      const btn = document.querySelector(CONFIG.selectors.scheduleButton);
      res.check2 = { scheduleButton: !!btn };
      if (btn) {
        btn.click();
        await sleep(1400);
        res.check2.labels = [...document.querySelectorAll('label, [role="button"], select, [aria-label]')]
          .map((e) => e.getAttribute('aria-label') || e.textContent.trim()).filter(Boolean).slice(0, 60);
        const dlg = document.querySelector('[aria-labelledby][role="dialog"]');
        res.check2.dialogHTML = dlg ? dlg.outerHTML.slice(0, 4000) : 'no dialog';
      }
    } catch (e) { res.check2 = { error: String(e) }; }
    try {
      res.check5 = {
        alive: await gmGet('https://publish.x.com/oembed?url=' + encodeURIComponent('https://x.com/jack/status/20')),
        dead: await gmGet('https://publish.x.com/oembed?url=' + encodeURIComponent('https://x.com/twitter/status/1111111111111111111')),
      };
    } catch (e) { res.check5 = { error: String(e) }; }
    console.log('[XBS] XBS_PROBE=' + JSON.stringify(res));
    try {
      const u = URL.createObjectURL(new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = u; a.download = 'xbs-probe.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
    } catch (e) { /* full result is in the console regardless */ }
    log(`Probe: insert=${res.check1 && res.check1.contains ? 'ok' : 'no'}, schedBtn=${res.check2 && res.check2.scheduleButton}, saved xbs-probe.json. Close the dialog (Esc).`);
  }

  // ------------------------------------------------------------------- UI
  function buildPanel() {
    if (document.getElementById('xbs-panel')) return;
    const wrap = document.createElement('div');
    wrap.id = 'xbs-panel';
    wrap.style.cssText = 'position:fixed;z-index:99999;right:8px;bottom:8px;width:230px;font:12px/1.4 sans-serif;background:#15202b;color:#fff;border:1px solid #38444d;border-radius:10px;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.4)';
    wrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b>X Bulk Scheduler</b>
        <span id="xbs-min" style="cursor:pointer;padding:0 6px">_</span>
      </div>
      <div id="xbs-body">
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0">
          <button data-a="harvest" style="flex:2">Harvest</button>
          <input id="xbs-hvn" type="number" min="0" inputmode="numeric" placeholder="all"
            title="How many NEW posts to grab. Blank = just the newly-added ones at the top. A number (e.g. 100) fast-forwards past what you already harvested and grabs that many older ones."
            style="width:46px;background:#0b1015;color:#fff;border:1px solid #38444d;border-radius:6px;padding:2px 4px;text-align:center"/>
          <button data-a="build"   style="flex:1">Build</button>
          <button data-a="run"     style="flex:1">Run</button>
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px">
          <button data-a="fixlinks" style="flex:2;background:#268">Fix Links (wrapper→original)</button>
          <button data-a="shuffle"  style="flex:1;background:#725">Shuffle</button>
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px">
          <button data-a="status" style="flex:1">Status</button>
          <button data-a="clear"  style="flex:1">Clear-Q</button>
          <button data-a="stop"   style="flex:1;background:#a01">Stop</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">
          <button data-a="captions" style="flex:1">Captions</button>
          <button data-a="export"   style="flex:1">Export</button>
          <button data-a="import"   style="flex:1">Import</button>
          <button data-a="delscan"  style="flex:1">Del-Scan</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">
          <button data-a="undo"    style="flex:1">Undo Hv</button>
          <button data-a="remove"  style="flex:1">Remove</button>
          <button data-a="inspect" style="flex:1">Inspect</button>
          <button data-a="photos"  style="flex:1" id="xbs-photos">Photos: off</button>
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px">
          <button data-a="probe" style="flex:1;background:#1a6">Probe (run tests)</button>
        </div>
        <pre id="xbs-log" style="height:120px;overflow:auto;background:#0b1015;margin:0;padding:4px;border-radius:6px;white-space:pre-wrap"></pre>
      </div>`;
    document.body.appendChild(wrap);

    const acts = {
      harvest: () => { const el = document.getElementById('xbs-hvn');
        harvest(el && el.value ? Number(el.value) : 0); },
      build: buildSchedule, run: runSchedule, stop: panic,
      fixlinks: resolveQueueLinks,
      shuffle: shuffleQueue,
      status: () => log(statusSummary()),
      clear: clearQueued,
      export: exportQueue,
      import: importQueue,
      captions: () => {
        const raw = prompt('Paste captions (one per line) to ADD to the pool, or leave blank to just schedule from the existing pool:');
        if (raw && raw.trim()) log(`Caption pool now ${captions.add(raw.split('\n'))} entr(y/ies).`);
        const n = prompt('How many caption-only posts to queue now? (blank = skip)');
        if (n && Number(n) > 0) buildCaptionSchedule(n);
      },
      delscan: () => {
        const rule = prompt(`Delete-SCAN (dry-run, deletes nothing). Rule?\n${DELETE_RULES.join(' / ')}`, 'liveMedia');
        if (!rule) return;
        const firstN = rule.trim() === 'firstN' ? prompt('How many (N)?', '100') : null;
        deleteScan(rule.trim(), firstN);
      },
      undo: undoLastHarvest,
      remove: () => {
        const t = prompt('Remove which link from the queue? Paste the status URL or id:');
        if (t) removeItem(t);
      },
      inspect: inspectView,
      photos: () => {
        CONFIG.harvestPhotos = !CONFIG.harvestPhotos;
        const b = document.getElementById('xbs-photos');
        if (b) b.textContent = `Photos: ${CONFIG.harvestPhotos ? 'on' : 'off'}`;
        log(`Photo harvesting ${CONFIG.harvestPhotos ? 'ON' : 'OFF'}.`);
      },
      probe,
    };
    wrap.querySelectorAll('button[data-a]').forEach((b) =>
      b.addEventListener('click', () => acts[b.dataset.a]()));
    wrap.querySelector('#xbs-min').addEventListener('click', () => {
      const body = wrap.querySelector('#xbs-body');
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });
    log(`ready — ${statusSummary()}`);
  }

  // ----------------------------------------------------------------- INIT
  function init() {
    if (!document.body) { setTimeout(init, 500); return; }
    buildPanel();
  }
  init();
  // Re-attach panel across X's client-side navigations.
  new MutationObserver(() => { if (!document.getElementById('xbs-panel')) buildPanel(); })
    .observe(document.documentElement, { childList: true, subtree: true });
})();
