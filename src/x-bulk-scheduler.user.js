// ==UserScript==
// @name         X Bulk Scheduler
// @namespace    x-bulk-scheduler
// @version      0.9.0
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
    gapMinutes: 0,          // SPACE BETWEEN POSTS, in minutes. 0 (default) = keep
                            //   the preset's session bursts (tight gapSeconds within
                            //   a session, sessionHours between sessions). Set > 0
                            //   (e.g. 30, 60) for a STEADY DRIP: every post that many
                            //   minutes apart from startTime, sessions ignored for
                            //   timing. Editable from "Timing"; persists.
    daysAhead: 1,           // how many days to schedule per run (queue-cap safety)
    appendVideoSuffix: true,// append /video/1 (or /photo/1) to harvested links
    harvestPhotos: false,   // COLLECT photo posts during Harvest (suffix /photo/1).
                            // Toggle from the panel's "Photos" button; persists.
                            // OFF = video-only harvest (original behaviour).
    mixPictures: false,     // What to DO with harvested photos at schedule time.
                            // OFF (default) = photo links are a SEPARATE, PARKED
                            //   pool: saved but never Built/Scheduled. Videos only.
                            // ON = mix the photo pool INTO the schedule alongside
                            //   videos (Build/Shuffle include them). Toggle from
                            //   the panel's "Mix Pics" button; persists.
    dryRun: true,           // TRUE = log actions only, never click final Confirm
    dailyCap: 48,           // stop scheduling past this many/day (free-tier ~50)
    unbookmarkAfterPost: true, // once a BOOKMARKED item is scheduled, remove it
                            // from bookmarks (trickled) so the backlog frontier
                            // stays at the top. Only acts on source==='bookmarks';
                            // PREVIEWS in log until BOOKMARK_REMOVE_MAPPED is set.
    useOembedCheck: false,  // Layer-2 dead-link ping. OFF: publish.x.com/oembed
                            // now returns 402 (paywalled) — see BUGS.md 2026-09-23.
                            // Tombstone detection (Layer 1) is the free primary.
    timezone: 'Africa/Lagos',
    // Like-bot (collection helper). Likes are used as a harvest surface: like the
    // filtered search results, review/unlike by hand, then Harvest from Likes.
    // GATED: obeys dryRun (default ON = preview only) AND asks once per page load
    // before the first LIVE like. Paced + capped to keep YOUR account out of X's
    // automation rate-limits — this is account-safety, not stealth.
    like: {
      cap: 50,            // default target per run (the number box overrides)
      maxPerRun: 80,      // hard ceiling — a run never likes more than this
      minGapMs: 1900,     // human-ish spacing between likes …
      gapSpread: 2600,    // … + up to this much random extra (≈1.9–4.5s each)
    },
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
      likeButton: '[data-testid="like"]',     // unliked heart; becomes "unlike" once liked
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

  // The bookmark-remove control isn't DOM-mapped yet (needs an on-device Inspect
  // of the "•••" menu). Until it is, unbookmark-after-post only PREVIEWS in the
  // log (never touches live bookmarks even with dryRun off). See runSchedule.
  const BOOKMARK_REMOVE_MAPPED = false;

  // --------------------------------------------------------------- STORAGE
  const KEYS = { queue: 'xbs_queue', posted: 'xbs_posted_ids', log: 'xbs_log',
    captions: 'xbs_captions', delcand: 'xbs_delete_candidates',
    lasthv: 'xbs_last_harvest', settings: 'xbs_settings' };

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

  // ------------------------------------------------------- SAVED SETTINGS
  // CONFIG is re-created on every page load, so timing tweaks made from the
  // panel are persisted here and re-applied at startup. Only these whitelisted
  // fields are user-editable from the panel (never dryRun — going live stays a
  // deliberate code change so nothing posts by accident).
  const SETTABLE = ['active', 'startTime', 'gapMinutes', 'daysAhead', 'dailyCap', 'harvestPhotos', 'mixPictures'];
  function loadSettings() {
    let s = {};
    try { s = JSON.parse(GM_getValue(KEYS.settings, '{}')) || {}; } catch (e) { s = {}; }
    for (const k of SETTABLE) if (s[k] !== undefined) CONFIG[k] = s[k];
  }
  function saveSettings() {
    const s = {};
    for (const k of SETTABLE) s[k] = CONFIG[k];
    GM_setValue(KEYS.settings, JSON.stringify(s));
  }
  loadSettings();

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
    log(`Cleared ${removed} queued item(s) (incl. any parked pictures). Scheduled/posted kept.`);
  }

  // FULL reset of harvest memory. Clear-Q only drops un-built items but the
  // dedupe checkpoint (already-harvested + posted ids) still makes Harvest SKIP
  // everything it saw before — so "re-harvest all my likes" needs this. It wipes
  // the whole queue AND that checkpoint, so the next Harvest re-collects your
  // entire Likes/Bookmarks list from scratch. Captions are kept. Destructive to
  // the "already done" memory: with dryRun ON nothing was ever posted so it's
  // safe now; once you go live, forgetting posted-ids means it could re-schedule
  // posts you already sent — so this always asks first.
  function resetHarvest() {
    const q = store.getQueue();
    const posted = store.getPosted().size;
    const ok = window.confirm(
      `RE-HARVEST RESET\n\nDelete ALL ${q.length} queued/built item(s) AND forget the ` +
      `${posted} already-harvested/posted id(s)?\n\nThe next Harvest will then re-collect your ` +
      `whole Likes/Bookmarks list from the top. Captions are kept.\n\nProceed?`);
    if (!ok) { log('Reset cancelled — nothing changed.', 'warn'); return; }
    store.setQueue([]);
    GM_setValue(KEYS.posted, '[]');
    GM_setValue(KEYS.lasthv, JSON.stringify({ at: new Date().toISOString(), source: null, ids: [] }));
    log(`Reset done: queue emptied, ${posted} harvested-id(s) forgotten. Harvest again to re-collect everything.`);
  }

  // ------------------------------------------------------------- SEARCH
  // Build a filtered X search URL from CONFIG.search (popular native videos by
  // keyword) and open it. From there you can Like the results (collection), then
  // review/unlike and Harvest from your Likes. Pure navigation — posts nothing.
  function buildSearchUrl(term) {
    const s = CONFIG.search;
    const parts = [String(term || '').trim()];
    if (s.onlyNativeVideo) parts.push('filter:native_video');
    if (s.excludeReplies) parts.push('-filter:replies');
    if (s.minFaves > 0) parts.push(`min_faves:${s.minFaves}`);
    if (s.lang) parts.push(`lang:${s.lang}`);
    return `https://x.com/search?q=${encodeURIComponent(parts.filter(Boolean).join(' '))}&f=live`;
  }
  function openSearch() {
    const term = prompt(
      `Search keyword (e.g. your client's name).\nWill be filtered to native videos`
      + `${CONFIG.search.minFaves ? ` with ≥${CONFIG.search.minFaves} likes` : ''}`
      + `${CONFIG.search.excludeReplies ? ', no replies' : ''}.`);
    if (term === null) return;
    const url = buildSearchUrl(term);
    log(`Opening filtered search: q="${decodeURIComponent(url.split('q=')[1].split('&')[0])}" (Latest tab). Then tap Like search, or Harvest from your Likes after.`);
    location.assign(url);
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
  // Mixes the un-posted pool so the posting timeline is varied instead of running
  // in harvest order (where the same account/batch sits back-to-back). Only
  // 'queued' items are touched; Build reads them IN ARRAY ORDER, so reordering
  // here decides the posting order. Two modes:
  //   • Free Shuffle   — uniform Fisher-Yates over the whole pool (no value).
  //   • Spread Shuffle — value-based (groups of N): deals across groups so links
  //     that were near each other in your Likes end up far apart. See
  //     spreadShuffleQueue() below.
  // Both finish with a best-effort pass that nudges apart any two neighbours from
  // the SAME account so you don't post the same creator twice in a row.
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
    const pr = shufflePoolRest();
    if (!pr) return;
    fisherYates(pr.pool);
    commitShuffle(pr.pool, pr.rest,
      `Free-shuffled ${pr.pool.length} un-posted link(s) into a random order. Tap Build to re-schedule.`);
  }

  // Shared: pull the schedulable un-posted pool out of the queue. Parked photos
  // stay in `rest` when Mix Pics is OFF; when ON they're part of the pool.
  function shufflePoolRest() {
    const q = store.getQueue();
    const pool = q.filter((x) => x.state === 'queued' && isSchedulable(x));
    const rest = q.filter((x) => !(x.state === 'queued' && isSchedulable(x)));
    if (pool.length < 2) {
      log('Nothing to shuffle — need 2+ un-posted, schedulable links in the pool.', 'warn');
      return null;
    }
    return { pool, rest };
  }
  function fisherYates(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }
  // Commit a freshly-ordered pool as the new posting order + best-effort same-
  // author spacing. A re-shuffle invalidates any stamped schedule, so clear it —
  // Build re-lays the whole pool in the new order.
  function commitShuffle(pool, rest, msg) {
    spreadSameAuthor(pool);
    pool.forEach((x) => { x.scheduledAt = null; x.day = 0; x.session = 0; x.slot = 0; });
    store.setQueue([...rest, ...pool]);
    log(msg);
  }

  // SPREAD shuffle (by group size N) — for when similar likes sit in runs (e.g.
  // 15–20 similar posts in a row). Splits the pool into consecutive groups of N in
  // harvest order (group A = links 1..N, group B = N+1..2N, …), shuffles inside
  // each group AND the group order, then DEALS one link at a time from a different
  // group each step (like dealing cards off several piles), re-randomising the
  // group order every pass. Result: links that were near each other end up far
  // apart, and the sequence is still random — NOT a fixed "1..10 then 11..20"
  // order, but e.g. one from 1..10, then 61..70, then 91..100, then 51..60…
  // Smaller N = more groups = similar links spread wider.
  function spreadShuffleQueue(groupSize) {
    const pr = shufflePoolRest();
    if (!pr) return;
    const n = Math.max(2, Math.floor(Number(groupSize) || 10));
    const { pool, rest } = pr;
    const groups = [];
    for (let i = 0; i < pool.length; i += n) groups.push(pool.slice(i, i + n));
    groups.forEach(fisherYates);   // shuffle within each group
    fisherYates(groups);           // shuffle the group order
    const out = [];
    let live = groups.filter((g) => g.length);
    while (live.length) {
      fisherYates(live);           // re-randomise which group we jump to each pass
      for (const g of live) out.push(g.shift());
      live = live.filter((g) => g.length);
    }
    commitShuffle(out, rest,
      `Spread-shuffled ${out.length} link(s) in ${groups.length} group(s) of ${n} — similar/adjacent links pulled apart. Tap Build to re-schedule.`);
  }

  // ------------------------------------------------------------- LIKE BOT
  // Likes the posts currently in view (scrolling to load more) up to a cap, so
  // the owner can use Likes as a collection surface: filter a search, Like N,
  // then review/unlike by hand, then Harvest from Likes.
  //
  // SAFETY, honestly: automated bulk-liking is exactly what X's platform-
  // manipulation systems watch for. Doing too many, too fast, risks YOUR account
  // (rate-limit → temp lock → in the worst case suspension). So this is:
  //   • OFF by default — obeys CONFIG.dryRun (preview-only until you flip it),
  //   • confirmed once per page load before the first LIVE like,
  //   • capped (never more than CONFIG.like.maxPerRun in a run),
  //   • paced with human-ish gaps (NOT to evade anything — to stay under limits).
  // A search for a name also surfaces OTHER people's posts, so it will like some
  // accounts that aren't your client — tighten the search filters first, and the
  // review-then-unlike step is your safety net.
  let LIKING = false;

  async function likeVisible(targetN) {
    if (LIKING) { log('Already liking.', 'warn'); return; }
    const want = Math.min(Number(targetN) > 0 ? Number(targetN) : CONFIG.like.cap, CONFIG.like.maxPerRun);
    // Works anywhere posts render — search results, a profile, or the feed. A
    // profile or a filtered search is the sane use (you know whose content it is).
    const path = location.pathname;
    const knownPage = /\/search|\/home/.test(path) ||
      /^\/[^/]+(\/(with_replies|media|likes|highlights)?)?$/.test(path);
    if (!knownPage) log('Tip: Like is meant for a filtered search or a profile. Liking whatever is in view here.', 'warn');
    if (!CONFIG.dryRun && !likeVisible._ok) {
      const ok = window.confirm(
        `LIKE BOT — live mode\n\nAbout to LIKE up to ${want} posts in view, ~1.9–4.5s apart.\n\n` +
        `These are REAL likes on other people's posts and count as automation, ` +
        `which can get your account rate-limited or locked. Only proceed on a ` +
        `search you've filtered to your client's content.\n\nProceed?`);
      if (!ok) { log('Like cancelled.', 'warn'); return; }
      likeVisible._ok = true; // confirmed for the rest of this page load
    }
    LIKING = true;
    log(`${CONFIG.dryRun ? '[dryRun] ' : ''}liking up to ${want} post(s)…`);
    let liked = 0, stable = 0;
    try {
      while (liked < want && stable < 4 && LIKING) {
        const btns = [...document.querySelectorAll(`${CONFIG.selectors.article} ${CONFIG.selectors.likeButton}`)];
        let clicked = 0;
        for (const b of btns) {
          if (!LIKING || liked >= want) break;
          const art = b.closest(CONFIG.selectors.article);
          const own = art ? articleOwnId(art) : null;
          const tag = own ? own.id : '?';
          if (CONFIG.dryRun) {
            log(`[dryRun] would like ${tag} (${liked + 1}/${want})`);
          } else {
            b.click();
            log(`liked ${tag} (${liked + 1}/${want})`);
          }
          liked++; clicked++;
          await sleep(jitter(CONFIG.like.minGapMs, CONFIG.like.gapSpread));
        }
        stable = clicked === 0 ? stable + 1 : 0;
        window.scrollBy(0, window.innerHeight * 0.9);
        await sleep(jitter(900, 500));
      }
      log(`${CONFIG.dryRun ? '[dryRun] ' : ''}Like run done: ${liked} post(s)${liked >= want ? '' : ' (ran out / stopped)'}. Review & unlike any you don't want, then Harvest from Likes.`);
    } finally { LIKING = false; }
  }

  // --------------------------------------------------------- SCHEDULE (math)
  // Photo links are a SEPARATE pool from videos. A photo is only eligible for
  // scheduling when CONFIG.mixPictures is ON; otherwise it stays parked (saved,
  // never Built/Run). Captions and video links are always schedulable.
  const isPhotoItem = (x) => x.media === 'photo';
  const isSchedulable = (x) => !isPhotoItem(x) || CONFIG.mixPictures;

  // Pure, local, no DOM, no network. Splits queued items into day/session/slot
  // and stamps each with a WAT timestamp. Idempotent: re-runnable any time.
  function buildSchedule() {
    const p = CONFIG.presets[CONFIG.active];
    const perDay = p.postsPerSession * p.sessions;
    const all = store.getQueue().filter((x) => x.state === 'queued');
    const queue = all.filter(isSchedulable);
    const parkedPics = all.length - queue.length;
    if (!queue.length) {
      log(parkedPics
        ? `Nothing schedulable — ${parkedPics} picture(s) are parked. Turn Mix Pics ON to include them.`
        : 'Nothing queued to schedule.', 'warn');
      return;
    }

    const [sh, sm] = CONFIG.startTime.split(':').map(Number);
    const evenGapMin = Math.max(0, Math.floor(Number(CONFIG.gapMinutes) || 0));
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
      if (evenGapMin > 0) {
        // Steady drip: every post evenGapMin minutes apart from startTime.
        // Sessions/slots still recorded for reference but don't shape the time.
        d.setMinutes(d.getMinutes() + within * evenGapMin);
      } else {
        // Preset session bursts: sessionHours between sessions, gapSeconds within.
        // (jittered spacing handled at run time)
        d.setHours(d.getHours() + session * p.sessionHours);
        d.setSeconds(d.getSeconds() + slot * p.gapSeconds);
      }

      item.day = day; item.session = session; item.slot = slot;
      item.scheduledAt = d.toISOString();
      store.upsert(item);
      n++;
    }
    const spacing = evenGapMin > 0 ? `${evenGapMin} min apart (drip)` : `${CONFIG.active} bursts`;
    log(`Schedule built: ${cap} posts across ${Math.ceil(cap / perDay)} day(s), ${spacing}.`
      + (parkedPics ? `  (${parkedPics} picture(s) parked — Mix Pics is OFF.)` : ''));
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
        const ok = await schedulePost(item);
        if (ok && CONFIG.unbookmarkAfterPost && item.source === 'bookmarks') {
          await unbookmarkAfterPost(item);
        }
        await sleep(jitter(1500, 1500)); // trickle writes, human-ish
      }
      log('Run complete.');
    } finally { RUNNING = false; }
  }

  // Trickled unbookmark once a bookmarked item is safely scheduled — the
  // permanent backlog fix (keeps the top of Bookmarks as the un-done frontier).
  // Honest state: the remove control isn't DOM-mapped yet, so this only logs the
  // intent. When BOOKMARK_REMOVE_MAPPED flips true (after an on-device Inspect of
  // the ••• menu → "Remove from Bookmarks"), wire the real click here.
  async function unbookmarkAfterPost(item) {
    if (CONFIG.dryRun || !BOOKMARK_REMOVE_MAPPED) {
      log(`${CONFIG.dryRun ? '[dryRun] ' : ''}would unbookmark ${item.id} (remove control not mapped yet)`);
      return;
    }
    // TODO(on-device): open the post's ••• menu, click "Remove from Bookmarks".
    log(`unbookmark ${item.id}: mapping pending`, 'warn');
  }

  function panic() {
    RUNNING = false;
    RESOLVING = false;
    LIKING = false;
    log('PANIC: run halted. In-flight items left as-is.', 'warn');
  }

  // Multi-line stats readout (Status button). Pure read, always safe.
  function statusSummary() {
    const q = store.getQueue();
    const by = (s) => q.filter((x) => x.state === s).length;
    const unbuilt = q.filter((x) => x.state === 'queued' && !x.scheduledAt);
    const vidPool = unbuilt.filter((x) => x.media !== 'photo').length;   // videos + captions
    const picPool = unbuilt.filter((x) => x.media === 'photo').length;   // parked pictures
    const built = q.filter((x) => x.state === 'queued' && x.scheduledAt).length;
    const postedIds = store.getPosted().size;
    const today = new Date().toDateString();
    const schedToday = q.filter((x) => x.scheduledAt &&
      new Date(x.scheduledAt).toDateString() === today).length;
    const nextAt = q.filter((x) => x.state === 'queued' && x.scheduledAt)
      .map((x) => x.scheduledAt).sort()[0];
    const nextStr = nextAt
      ? new Date(nextAt).toLocaleString('en-GB', { timeZone: CONFIG.timezone })
      : '—';
    const p = CONFIG.presets[CONFIG.active];
    const perDay = p.postsPerSession * p.sessions;
    return [
      `videos+caps:${vidPool}  pictures(parked):${picPool}  ready(built):${built}  handed-to-X:${by('scheduled')}`,
      `dead:${by('dead')}  rejected:${by('rejected')}  posted-ids tracked:${postedIds}`,
      `scheduled today:${schedToday}  next:${nextStr}`,
      `preset:${CONFIG.active} (${p.postsPerSession}×${p.sessions}=${perDay}/day)  start:${CONFIG.startTime}  gap:${CONFIG.gapMinutes > 0 ? CONFIG.gapMinutes + 'min drip' : 'bursts'}  daysAhead:${CONFIG.daysAhead}  cap:${CONFIG.dailyCap}/day  mixPics:${CONFIG.mixPictures}  dryRun:${CONFIG.dryRun}`,
    ].join('\n');
  }

  // ------------------------------------------------------------- SELF-TEST
  // Runs the PURE logic — schedule math, shuffle/spread, picture parking,
  // search-URL builder, syndication parsing, dead-link regex, id/url helpers —
  // against synthetic data and reports PASS/FAIL in the panel log. It touches NO
  // X page, makes NO network calls, and posts/likes NOTHING. It snapshots your
  // real queue + settings and RESTORES them in a finally, so it never disturbs
  // your pool. (The DOM-dependent parts — like button, composer, picker, harvest
  // scan — can't be checked off the live page; those stay the on-device dryRun
  // tests + Probe.) Safe to tap anytime.
  function selfTest() {
    const results = [];
    const ok = (name, cond) => results.push({ name, pass: !!cond });
    const eqSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
    const snap = {
      queue: GM_getValue(KEYS.queue, '[]'),
      posted: GM_getValue(KEYS.posted, '[]'),
      settings: GM_getValue(KEYS.settings, '{}'),
      active: CONFIG.active, mix: CONFIG.mixPictures, days: CONFIG.daysAhead,
      cap: CONFIG.dailyCap, start: CONFIG.startTime, gap: CONFIG.gapMinutes,
    };
    try {
      // -- id / url helpers --
      ok('extractStatusId', extractStatusId('/bob/status/12345/video/1') === '12345');
      ok('buildUrl video', buildUrl('123', 'bob', 'video').endsWith('/bob/status/123/video/1'));
      ok('buildUrl photo', buildUrl('123', 'bob', 'photo').endsWith('/bob/status/123/photo/1'));
      ok('authorOf', authorOf({ url: 'https://x.com/alice/status/1' }) === 'alice');
      // -- filtered search URL --
      const su = decodeURIComponent(buildSearchUrl('rosemary'));
      ok('search term', su.includes('rosemary'));
      ok('search native_video', su.includes('filter:native_video'));
      ok('search min_faves', su.includes('min_faves:1000'));
      // -- syndication (wrapper -> original) parsing --
      ok('syn quoted', (() => { const r = originalFromSyndication(
        { quoted_tweet: { id_str: '999', user: { screen_name: 'og' } } }, '111');
        return r && r.id === '999' && r.author === 'og'; })());
      ok('syn media source', (() => { const r = originalFromSyndication(
        { mediaDetails: [{ source_status_id_str: '888',
          additional_media_info: { source_user: { screen_name: 'src' } } }] }, '111');
        return r && r.id === '888' && r.author === 'src'; })());
      ok('syn native -> null', originalFromSyndication({ full_text: 'hi' }, '111') === null);
      ok('syn same-id -> null', originalFromSyndication({ quoted_tweet: { id_str: '111' } }, '111') === null);
      ok('synToken format', (() => { const t = synToken('1234567890123456789');
        return typeof t === 'string' && t.length > 0 && !/[0.]/.test(t); })());
      // -- dead-link (tombstone) regex --
      const fakeArt = (txt, hasVideo) => ({
        querySelector: (s) => (hasVideo && /video/i.test(s)) ? {} : null, innerText: txt });
      ok('tombstone dead', isTombstone(fakeArt('This post was deleted.', false)) === true);
      ok('tombstone alive', isTombstone(fakeArt('This post was deleted.', true)) === false);
      // -- picture parking / isSchedulable --
      CONFIG.mixPictures = false;
      ok('park photo (mix off)', isSchedulable({ media: 'video' }) === true
        && isSchedulable({ media: 'photo' }) === false);
      CONFIG.mixPictures = true;
      ok('mix photo (mix on)', isSchedulable({ media: 'photo' }) === true);
      // -- schedule math (large pool, cap) --
      CONFIG.active = '12x4'; CONFIG.daysAhead = 1; CONFIG.dailyCap = 48;
      CONFIG.startTime = '00:00'; CONFIG.mixPictures = false;
      const p = CONFIG.presets['12x4'];
      const perDay = p.postsPerSession * p.sessions;                 // 48
      const mk = (i, media) => ({ id: 'T' + i, url: `https://x.com/u${i % 5}/status/${i}`,
        kind: 'link', media, state: 'queued', day: 0, session: 0, slot: 0,
        scheduledAt: null, source: 'selftest', errors: [] });
      const big = []; for (let i = 0; i < 50; i++) big.push(mk(i, 'video'));
      store.setQueue(big); buildSchedule();
      let q2 = store.getQueue();
      const built = q2.filter((x) => x.scheduledAt);
      ok('build caps at perDay', built.length === Math.min(50, perDay));
      ok('build all day 0', q2.filter((x) => x.scheduledAt && x.day === 0).length === built.length);
      ok('build session boundary', built[12] && built[12].session === 1 && built[12].slot === 0);
      ok('build last slot', built[47] && built[47].session === 3 && built[47].slot === 11);
      // -- per-post even spacing (gapMinutes drip) --
      CONFIG.gapMinutes = 30; CONFIG.startTime = '09:00';
      store.setQueue(big.map((x) => ({ ...x, state: 'queued', scheduledAt: null })));
      buildSchedule();
      const drip = store.getQueue().filter((x) => x.scheduledAt)
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
      const t0 = new Date(drip[0].scheduledAt);
      const t1 = new Date(drip[1].scheduledAt);
      const t2 = new Date(drip[2].scheduledAt);
      ok('drip start honours startTime', t0.getHours() === 9 && t0.getMinutes() === 0);
      ok('drip gap = gapMinutes', (t1 - t0) === 30 * 60000 && (t2 - t1) === 30 * 60000);
      CONFIG.gapMinutes = 0; CONFIG.startTime = '00:00';
      // -- picture parking through Build (small pool) --
      const small = [mk(1, 'video'), mk(2, 'video'), mk(3, 'video'), mk(4, 'video'),
        mk(900, 'photo'), mk(901, 'photo')];
      CONFIG.mixPictures = false;
      store.setQueue(small.map((x) => ({ ...x }))); buildSchedule();
      q2 = store.getQueue();
      ok('build parks photos (mix off)',
        q2.filter((x) => x.media === 'video' && x.scheduledAt).length === 4
        && q2.filter((x) => x.media === 'photo' && x.scheduledAt).length === 0);
      CONFIG.mixPictures = true;
      store.setQueue(small.map((x) => ({ ...x }))); buildSchedule();
      q2 = store.getQueue();
      ok('build mixes photos (mix on)',
        q2.filter((x) => x.media === 'photo' && x.scheduledAt).length === 2);
      // -- shuffle: permutation, no loss/dupes --
      const beforeIds = big.map((x) => x.id);
      store.setQueue(big.map((x) => ({ ...x, state: 'queued', scheduledAt: null })));
      CONFIG.mixPictures = true; shuffleQueue();
      const afterIds = store.getQueue().map((x) => x.id);
      ok('shuffle keeps every id', eqSet(beforeIds, afterIds));
      ok('shuffle no dupes', new Set(afterIds).size === afterIds.length);
      // -- spread shuffle: permutation + strong diversification (groups of 10) --
      const tagged = big.map((x, i) => ({ ...x, grp: Math.floor(i / 10),
        state: 'queued', scheduledAt: null }));
      store.setQueue(tagged); CONFIG.mixPictures = true; spreadShuffleQueue(10);
      const outQ = store.getQueue();
      ok('spread keeps every id', eqSet(beforeIds, outQ.map((x) => x.id)));
      ok('spread no dupes', new Set(outQ.map((x) => x.id)).size === outQ.length);
      let sameGrpAdj = 0;
      for (let i = 1; i < outQ.length; i++) if (outQ[i].grp === outQ[i - 1].grp) sameGrpAdj++;
      ok('spread separates original groups', sameGrpAdj <= 8); // random baseline ~10
      // -- spreadSameAuthor separates a solvable case --
      const sp = [{ url: 'x.com/a/status/1' }, { url: 'x.com/a/status/2' },
        { url: 'x.com/b/status/3' }, { url: 'x.com/c/status/4' }];
      spreadSameAuthor(sp);
      let adj = 0; for (let i = 1; i < sp.length; i++)
        if (authorOf(sp[i]) === authorOf(sp[i - 1])) adj++;
      ok('spread separates authors', adj === 0);
    } catch (e) {
      results.push({ name: 'EXCEPTION: ' + (e && e.message || e), pass: false });
    } finally {
      GM_setValue(KEYS.queue, snap.queue);
      GM_setValue(KEYS.posted, snap.posted);
      GM_setValue(KEYS.settings, snap.settings);
      CONFIG.active = snap.active; CONFIG.mixPictures = snap.mix;
      CONFIG.daysAhead = snap.days; CONFIG.dailyCap = snap.cap; CONFIG.startTime = snap.start;
      CONFIG.gapMinutes = snap.gap;
    }
    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass);
    log(`Self-Test: ${passed}/${results.length} passed${failed.length ? '' : ' — all green, your pool untouched.'}`);
    failed.forEach((r) => log(`  FAIL: ${r.name}`, 'warn'));
    return { passed, total: results.length, failed: failed.map((r) => r.name) };
  }

  // "Timing" button — edit the schedule shape without touching code (owner is
  // non-technical). prompt()-based so it works on mobile; persists via saveSettings.
  function editTiming() {
    const presetKeys = Object.keys(CONFIG.presets);
    const pr = prompt(`Preset — how many posts per day.\nOptions: ${presetKeys.join(' , ')}\nBlank = keep (${CONFIG.active}).`);
    if (pr && CONFIG.presets[pr.trim()]) CONFIG.active = pr.trim();
    else if (pr && pr.trim()) { log(`Unknown preset "${pr.trim()}" — kept ${CONFIG.active}.`, 'warn'); }

    const st = prompt(`Daily start time, 24h HH:MM (WAT).\nBlank = keep (${CONFIG.startTime}).`);
    if (st && /^\d{1,2}:\d{2}$/.test(st.trim())) CONFIG.startTime = st.trim();
    else if (st && st.trim()) log(`"${st.trim()}" isn't HH:MM — kept ${CONFIG.startTime}.`, 'warn');

    const gm = prompt(`Space between posts, in MINUTES.\n0 = preset bursts (tight, then long gaps).\nAny number = steady drip that many minutes apart (e.g. 30, 60).\nBlank = keep (${CONFIG.gapMinutes}).`);
    if (gm !== null && gm.trim() !== '') {
      const v = Number(gm.trim());
      if (v >= 0 && Number.isFinite(v)) CONFIG.gapMinutes = Math.floor(v);
      else log(`"${gm.trim()}" isn't a number — kept gap ${CONFIG.gapMinutes} min.`, 'warn');
    }

    const da = prompt(`How many days ahead to schedule per run.\nBlank = keep (${CONFIG.daysAhead}).`);
    if (da && Number(da) > 0) CONFIG.daysAhead = Math.floor(Number(da));

    const cap = prompt(`Daily cap (safety ceiling; X free-tier ≈ 50).\nBlank = keep (${CONFIG.dailyCap}).`);
    if (cap && Number(cap) > 0) CONFIG.dailyCap = Math.floor(Number(cap));

    saveSettings();
    const p = CONFIG.presets[CONFIG.active];
    const gapTxt = CONFIG.gapMinutes > 0 ? `${CONFIG.gapMinutes} min apart` : `${CONFIG.active} bursts`;
    log(`Timing saved: ${CONFIG.active} (${p.postsPerSession * p.sessions}/day), start ${CONFIG.startTime}, ${gapTxt}, ${CONFIG.daysAhead} day(s) ahead, cap ${CONFIG.dailyCap}. Tap Build to apply.`);
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
          <button data-a="fixlinks" style="flex:1;background:#268">Fix Links (wrapper→original)</button>
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px;align-items:center">
          <button data-a="shuffle" style="flex:2;background:#725"
            title="Free Shuffle: fully random reorder of the whole pool (no value used).">Free Shuffle</button>
          <button data-a="spread" style="flex:2;background:#537"
            title="Spread Shuffle: uses the number box. Splits links into groups of N in the order you liked them, then deals one from a different group at a time so similar/adjacent likes land far apart.">Spread Shuffle</button>
          <input id="xbs-shufn" type="number" min="2" inputmode="numeric" placeholder="10"
            title="Spread Shuffle group size (default 10). Bigger = bigger groups; smaller spreads similar links wider apart."
            style="width:46px;background:#0b1015;color:#fff;border:1px solid #38444d;border-radius:6px;padding:2px 4px;text-align:center"/>
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px;align-items:center">
          <button data-a="like" style="flex:2;background:#b25">Like search</button>
          <input id="xbs-liken" type="number" min="1" inputmode="numeric" placeholder="50"
            title="How many posts in view to like (default 50). Run this on a SEARCH page you've filtered. Obeys dryRun — flip dryRun off to actually like."
            style="width:46px;background:#0b1015;color:#fff;border:1px solid #38444d;border-radius:6px;padding:2px 4px;text-align:center"/>
          <button data-a="search" style="flex:1;background:#158">Search</button>
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px">
          <button data-a="status" style="flex:1">Status</button>
          <button data-a="timing" style="flex:1">Timing</button>
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
          <button data-a="mixpics" style="flex:1" id="xbs-mixpics">Mix Pics: off</button>
          <button data-a="reset"   style="flex:1;background:#a01">Reset (re-harvest)</button>
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px">
          <button data-a="selftest" style="flex:1;background:#26a">Self-Test (logic)</button>
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
      spread: () => { const el = document.getElementById('xbs-shufn');
        spreadShuffleQueue(el && el.value ? Number(el.value) : 10); },
      like: () => { const el = document.getElementById('xbs-liken');
        likeVisible(el && el.value ? Number(el.value) : 0); },
      status: () => log(statusSummary()),
      timing: editTiming,
      clear: clearQueued,
      reset: resetHarvest,
      search: openSearch,
      selftest: selfTest,
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
        saveSettings();
        const b = document.getElementById('xbs-photos');
        if (b) b.textContent = `Photos: ${CONFIG.harvestPhotos ? 'on' : 'off'}`;
        log(`Photo harvesting ${CONFIG.harvestPhotos ? 'ON — Harvest will now collect picture posts too (kept as a parked pool).' : 'OFF — Harvest collects videos only.'}`);
      },
      mixpics: () => {
        CONFIG.mixPictures = !CONFIG.mixPictures;
        saveSettings();
        const b = document.getElementById('xbs-mixpics');
        if (b) b.textContent = `Mix Pics: ${CONFIG.mixPictures ? 'on' : 'off'}`;
        log(CONFIG.mixPictures
          ? 'Mix Pics ON — parked pictures will be scheduled alongside videos. Tap Shuffle/Build to fold them in.'
          : 'Mix Pics OFF — pictures stay parked (saved) and are NOT scheduled until you turn this on.');
      },
      probe,
    };
    wrap.querySelectorAll('button[data-a]').forEach((b) =>
      b.addEventListener('click', () => acts[b.dataset.a]()));
    wrap.querySelector('#xbs-min').addEventListener('click', () => {
      const body = wrap.querySelector('#xbs-body');
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });
    // Reflect persisted toggle states on the buttons.
    const pb = document.getElementById('xbs-photos');
    if (pb) pb.textContent = `Photos: ${CONFIG.harvestPhotos ? 'on' : 'off'}`;
    const mb = document.getElementById('xbs-mixpics');
    if (mb) mb.textContent = `Mix Pics: ${CONFIG.mixPictures ? 'on' : 'off'}`;
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

  // Test hook — a NO-OP under Tampermonkey (module is undefined there). Lets the
  // local node harness (test/selftest.node.js) import the pure logic and run
  // selfTest() off-device, so bugs are caught before the script ever hits X.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CONFIG, store, selfTest, buildSchedule, shuffleQueue, spreadShuffleQueue,
      spreadSameAuthor, authorOf, isSchedulable, isPhotoItem, buildSearchUrl,
      synToken, originalFromSyndication, isTombstone, buildUrl, extractStatusId,
      statusSummary,
    };
  }
})();
