// Remove marked quick starts at build time, alongside their development-only data.
// Keeping this out of runtime JS also avoids flashing an unusable button before startup.
export function stripDevOnlyButtons(html) {
  return html.replace(/\s*<button\b(?=[^>]*\bdata-dev-only\b)[^>]*>[\s\S]*?<\/button>/g, '');
}
