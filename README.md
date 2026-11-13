# BallEngine — Public Website Capture

> [!IMPORTANT]
> This repository contains **publicly accessible website pages and assets captured from [ballengine.app](https://ballengine.app/)** for reference and possible reconstruction. It is **not** the original BallEngine source repository, and it does **not** include private server code, databases, credentials, or a working backend.

## Overview

The files were collected with the [webcloner](https://github.com/labpnet33/webcloner) workflow using Playwright and an additional wget capture. The goal is to preserve the publicly visible interface, routes, downloaded browser assets, and screenshots as a starting point for studying or rebuilding a website.

The capture includes HTML pages, browser-delivered JavaScript and CSS, images, fonts, screenshots, and crawl reports. Some pages may render offline, but **a complete working application is not guaranteed**.

**Original website:** https://ballengine.app/  
**Repository:** https://github.com/labpnet33/ballengine  
**Capture date:** November 13, 2026

## Repository structure

```text
ballengine/
├── README.md
├── all-engines-report.txt       # Summary of the capture runs
├── playwright.zip               # Archive of the Playwright capture
├── playwright/
│   ├── site/                    # Saved pages and browser-loaded assets
│   │   ├── assets/              # Captured JS and CSS bundles
│   │   ├── es/                  # Example localized page
│   │   ├── fr/
│   │   ├── de/
│   │   └── ...
│   ├── screenshots/             # Browser screenshots
│   ├── manifest.json            # Capture metadata and asset mapping
│   ├── pages.json               # Visited page information
│   ├── errors.json              # Crawl errors
│   └── report.txt               # Playwright crawl summary
└── extra/
    ├── wget/
    │   └── ballengine.app/      # Additional public-page mirror
    ├── wget-run.log
    └── extra-capture-report.txt
```

## Capture results

According to the checked-in reports:

| Item | Result |
| --- | --- |
| Playwright pages visited | 80 |
| Playwright resources saved | 239 |
| Playwright data saved | 27.21 MiB |
| URLs excluded by robots rules | 374 |
| Playwright page/asset errors | 1 |
| Playwright capture exit status | 0 |
| Additional wget capture | Completed with HTTP errors (exit 8) |
| Browsertrix capture | Skipped because Docker was unavailable |

The Playwright report records a timeout when opening the original root URL (`https://ballengine.app/`), so **`playwright/site/index.html` is not present** in this snapshot. A separate `extra/wget/ballengine.app/index.html` exists.

See [Playwright report](playwright/report.txt) and [extra capture report](extra/extra-capture-report.txt) for details.

## Local preview

No Node.js project manifest, application source build instructions, or backend startup procedure is included at the repository root. You can use a static HTTP server to inspect the saved files.

### 1. Clone the repository

```bash
git clone https://github.com/labpnet33/ballengine.git
cd ballengine
```

### 2. Preview the wget mirror

With Python 3 installed, run:

```bash
python3 -m http.server 8000 --directory extra/wget/ballengine.app
```

Then open [http://localhost:8000/](http://localhost:8000/) in a browser.

On Windows, `py -m http.server 8000 --directory extra/wget/ballengine.app` is an alternative.

### 3. Preview the Playwright files (optional)

Stop the previous server, then run:

```bash
python3 -m http.server 8000 --directory playwright/site
```

Open a captured route such as [http://localhost:8000/es/](http://localhost:8000/es/). Do not expect the root route to work because that page was not saved by Playwright.

> These commands **serve static files only**. They do not restore original APIs, login, payments, rendering or export services, or other server-side functionality. Some asset paths and links may need to be rewritten for a particular host.

## What is available?

- Public HTML routes, including localized pages and other visited public routes.
- Browser-delivered JavaScript/CSS bundles, fonts, and images.
- Screenshots and JSON capture metadata to help compare page appearance.
- A second wget-based snapshot to help investigate missing assets or pages.

These are **captured outputs**, not editable original React/TypeScript component source files. Any reconstruction should be treated as a separate implementation effort.

## Known limitations

1. **Missing private code:** Backends, API internals, databases, and protected content are not part of a public browser capture.
2. **Incomplete coverage:** The crawl had one reported Playwright error, skipped robots-excluded URLs, and may have missed interaction-triggered or lazy-loaded resources.
3. **Static hosting differences:** Client-side routing, absolute URLs, cached assets, and API requests may fail when served locally or deployed elsewhere.
4. **No validated production build:** The repository currently provides capture artifacts, not a tested, deployable full-stack project.
5. **Third-party material:** Captured text, images, fonts, and scripts may be owned by the original publisher or other rights holders.

## Suggested reconstruction workflow

If the goal is to build a working application from these files:

1. Review the captured pages, screenshots, and `manifest.json`.
2. Identify the UI components, navigation, interactions, and required APIs.
3. Create an independent front-end project with an explicit build setup.
4. Implement and test simulation, music synchronization, video rendering, and other desired features rather than assuming the captured bundles provide complete services.
5. Replace missing backend endpoints with independently implemented services.
6. Verify desktop and mobile behavior before deploying.

Keep the capture as a **reference snapshot**, preferably separate from any new application source.

## Legal and usage notice

This is an independently maintained collection of publicly captured website resources, **not an official BallEngine project**. No license granting reuse of the original site's proprietary content is provided by this repository. Respect applicable copyright, licenses, trademarks, robots directives, and the original website's terms. Do not redistribute or deploy third-party materials unless you have the necessary rights.

---

**Maintained in:** [labpnet33/ballengine](https://github.com/labpnet33/ballengine)
