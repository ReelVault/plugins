# v1.3.0

### Features

- **Quick request from a poster** — a small + in the poster corner requests the title after a confirmation. Tapping the poster opens its details.
- **Confirmation sheet** — removing a request asks for confirmation in a plugin sheet, which becomes a bottom sheet on phones, instead of the browser's confirm dialog.

### Fixes

- **Card clicks** — tapping a poster opens its details. A request overlay used to cover most of the card and take the click, and on touch screens the first tap also triggered the hover state.
- **No page reloads** — a request updates the card and the details badge from the server's answer. Background refreshes keep the content on screen instead of switching to placeholders or a full-page spinner.
- **Phone layout** — 16 px side gutter, shelves and filter chips reach the screen edge and swipe, carousel arrows are hidden on touch, the hero stacks, and admin row actions get their own line. Touch targets are at least 40 px, inputs are 16 px so iOS does not zoom, and hover effects apply only to pointer devices.
- **Navigation** — the Requests pages no longer appear in the main navbar. The profile menu entry opens them.
- **Readability** — meta text is at least 12 px and uppercase labels at least 11 px. The dashboard heading stays readable in both themes.
- **Carousel and styles** — carousel arrows stay inside their row, and the active filter chip and the "noted" action get their styles again.
- **Wording** — removing a request uses the same label on every screen, and the unsupported-discovery message describes title lists instead of channels.
