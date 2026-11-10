# Timing form synthetic test

The form validates 24-hour input and whole-number bounds: gap 0–1440 minutes, days 1–366, cap 1–1000. These are interface bounds, not assertions about X's limits. Cancel and a simulated synchronous save failure retain the existing settings; a successful save preserves unknown saved fields. The test uses fictional storage and intercepted requests, and exercises keyboard activation, Escape and focus restoration.

The form labels the start time as browser local time because the baseline planner uses local Date operations. This alone does not verify the complete planner, actual X picker or selected instant; other parts of the baseline still display times in WAT. It does not address daylight-saving transitions, cross-tab races, durable/ambiguous asynchronous storage failure, installed userscript behavior, mobile devices or screen-reader acceptance.

With Node, Playwright and Chromium installed, run `node --test tests/timing-form.synthetic.test.js`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if required. The test requires no account and makes no live network requests or X actions.
