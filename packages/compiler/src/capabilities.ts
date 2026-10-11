import type { Capabilities } from './types.ts';

export const postgresCapabilities: Readonly<Capabilities> = Object.freeze({
  joins: true,
  transactions: true,
  docPaths: true,
  vector: true,
  graph: true,
  timeSeries: true,
  fullText: true,
  ttl: false,
});

export const sqliteCapabilities: Readonly<Capabilities> = Object.freeze({
  joins: true,
  transactions: true,
  docPaths: true,
  vector: false,
  graph: true,
  timeSeries: false,
  fullText: true,
  ttl: false,
});

export const libsqlCapabilities: Readonly<Capabilities> = Object.freeze({
  joins: true,
  transactions: true,
  docPaths: true,
  vector: false,
  graph: true,
  timeSeries: false,
  fullText: true,
  ttl: false,
});

export const mongodbCapabilities: Readonly<Capabilities> = Object.freeze({
  joins: false,
  transactions: true,
  docPaths: true,
  vector: true,
  graph: false,
  timeSeries: false,
  fullText: true,
  ttl: true,
});

export const firestoreCapabilities: Readonly<Capabilities> = Object.freeze({
  joins: false,
  transactions: true,
  docPaths: true,
  vector: false,
  graph: false,
  timeSeries: false,
  fullText: false,
  ttl: true,
});

export const redisCapabilities: Readonly<Capabilities> = Object.freeze({
  joins: false,
  transactions: false,
  docPaths: false,
  vector: false,
  graph: false,
  timeSeries: false,
  fullText: false,
  ttl: true,
});

export const d1Capabilities: Readonly<Capabilities> = Object.freeze({
  joins: true,
  transactions: true,
  docPaths: true,
  vector: false,
  graph: false,
  timeSeries: false,
  fullText: true,
  ttl: false,
});

export const engineCapabilities: Record<string, Readonly<Capabilities>> = {
  postgres: postgresCapabilities,
  sqlite: sqliteCapabilities,
  libsql: libsqlCapabilities,
  mongodb: mongodbCapabilities,
  firestore: firestoreCapabilities,
  redis: redisCapabilities,
  d1: d1Capabilities,
};

export const documentCapabilities: Readonly<Capabilities> = mongodbCapabilities;
export const kvCapabilities: Readonly<Capabilities> = redisCapabilities;

export function capabilitiesForEngine(engine: string): Capabilities {
  return engineCapabilities[engine.toLowerCase()] ?? postgresCapabilities;
}


