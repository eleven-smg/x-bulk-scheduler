# Literal DOM source paths: synthetic test

The DOM resolver now accepts only literal relative `/handle/status/id` paths (with optional numeric video/photo suffix). Unsupported absolute paths, query strings and fragments are conservatively ignored, even if legitimate; this can leave a wrapper unresolved. This does not integrate the unavailable experimental source fix, change the syndication resolver, settle competing source evidence, or verify actual X presentations or independent public examples. It is partial work on #58, not a complete fix.

With Node.js, Playwright and compatible Chromium installed, run `node --test tests/strict-dom-source.synthetic.test.js`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if needed. The test uses fictional DOM and intercepted network requests; it does not access an account or perform X actions.
