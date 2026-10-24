// Remove marked buttons and spans (quick starts, workshop and Oct 10 controls, text about them) at build time,
// alongside their development-only data. Keeping this out of runtime JS also avoids flashing an unusable button
// before startup. A marked span must not contain another span.
export function stripDevOnlyButtons(html) {
  return html.replace(/\s*<(button|span)\b(?=[^>]*\bdata-dev-only\b)[^>]*>[\s\S]*?<\/\1>/g, '');
}
