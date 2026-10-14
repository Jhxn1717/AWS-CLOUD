import { config } from '../config/env';

/** Inherit OS tools, but not the platform's application settings or credentials. */
export function projectEnvironment(variables: Record<string, string> = {}): Record<string, string> {
  const inherited = { ...process.env } as Record<string, string>;
  for (const key of [...Object.keys(config), 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME']) delete inherited[key];
  if (process.platform === 'win32') {
    const osPath = process.env.PATH ?? '';
    for (const key of Object.keys(inherited)) if (key.toUpperCase() === 'PATH') delete inherited[key];
    inherited.PATH = osPath;
  }
  return { ...inherited, ...variables };
}
