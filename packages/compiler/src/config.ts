import type { ConnectionModel, EngineType } from './types.ts';

export function parseColtToml(content: string): ConnectionModel[] {
  const connections: ConnectionModel[] = [];
  const lines = content.split('\n');
  let currentAlias: string | undefined;
  let currentEngine: string | undefined;
  let currentUrlEnv: string | undefined;

  const flush = () => {
    if (currentAlias && currentEngine) {
      connections.push({
        alias: currentAlias,
        engine: currentEngine.toLowerCase() as EngineType,
        urlEnv: currentUrlEnv,
      });
    }
    currentAlias = undefined;
    currentEngine = undefined;
    currentUrlEnv = undefined;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[connections\.([A-Za-z0-9_]+)\]$/);
    if (sectionMatch) {
      flush();
      currentAlias = sectionMatch[1];
      continue;
    }

    if (currentAlias) {
      const kvMatch = line.match(/^([A-Za-z0-9_]+)\s*=\s*["']([^"']*)["']$/);
      if (kvMatch) {
        const key = kvMatch[1]?.toLowerCase();
        const value = kvMatch[2];
        if (key === 'engine') currentEngine = value;
        if (key === 'url_env' || key === 'env_var') currentUrlEnv = value;
      }
    }
  }

  flush();
  return connections;
}
