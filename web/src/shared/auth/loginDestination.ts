/** Only return to an internal route supplied by the authentication guard. */
export function loginDestination(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
    || /[\\\u0000-\u0020\u007f]/.test(value)) return '/';
  // Returning to another auth screen creates a redirect loop for signed-in users.
  if (/^\/(login|register|forgot-password)(?:[/?#]|$)/.test(value)) return '/';
  return value;
}
