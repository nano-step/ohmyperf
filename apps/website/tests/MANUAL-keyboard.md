# Manual Keyboard Navigation Test Plan

Run before each release. Use keyboard only (Tab, Shift+Tab, Enter, Space, Esc). No mouse.

## `/` — Landing

- [ ] Tab through page: skip-link → logo → nav links → URL input → Measure button → secondary CTAs
- [ ] Focus ring visible on all interactive elements
- [ ] Enter submits form when URL input is filled
- [ ] Shift+Tab reverses order correctly

## `/measure` — Measurement flow

- [ ] URL input has autofocus on page load
- [ ] Backend card reachable via Tab from URL input
- [ ] Cancel button reachable via Tab while streaming
- [ ] Enter on Cancel cancels the job
- [ ] Esc does nothing when no dialog is open

## `/report/[id]` — Report detail

- [ ] CWV gauges have `aria-label="LCP 1.2s, Good"` (or similar with actual value + rating)
- [ ] Gauge container has `role="img"`
- [ ] Tab order: back button → CWV tiles → waterfall → frame tree → audits
- [ ] Screen reader announces gauge labels via `<p class="sr-only">`

## `/viewer` — File drop

- [ ] Drop zone reachable via Tab
- [ ] Enter on drop zone opens native file picker
- [ ] After file drop, focus moves to report content area

## `/report` — History list

- [ ] Search input has autofocus on page load
- [ ] Each row's open link reachable via Tab
- [ ] Each row's Delete button reachable via Tab
- [ ] Checkbox reachable via Tab
- [ ] Bulk Delete button visible and reachable when rows are selected
- [ ] Confirm dialog: Esc dismisses, Tab cycles inside (focus trap), Enter on Delete confirms
- [ ] After dialog close, focus returns to Bulk Delete button (or last focused item)

## Dialogs (general)

- [ ] Esc closes any open dialog
- [ ] Tab cycles only within open dialog (focus trapped)
- [ ] Initial focus lands on primary action or cancel button
- [ ] Focus restores to trigger element after close

## CWV Gauge ARIA pattern

Each gauge should be implemented as:

```tsx
<div role="img" aria-label={`${metricName} ${formatValue(median, unit)}, ${rating}`}>
  <canvas ref={canvasRef} aria-hidden="true" />
  <p className="sr-only">{fullDescription}</p>
</div>
```
