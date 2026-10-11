import { postgresCapabilities } from '../../compiler/src/index.js';
import {
  createFirebaseAuthClientFromEnv,
  createFirestoreClientFromEnv,
  createTenantContext,
  type FirebaseAuthClient,
  type FirestoreClient,
  FirestoreStoreAdapter,
  InMemoryLibsqlClient,
  InMemoryMongoDatabase,
  InMemoryRedisClient,
  InMemorySqlExecutor,
  InMemoryStoreAdapter,
  InMemoryTenantRepository,
  MongoStoreAdapter,
  MultiBackendStoreAdapter,
  NeonStoreAdapter,
  parseTenantId,
  RedisStoreAdapter,
  type StoreAdapter,
  SupabaseStoreAdapter,
  TenantGuard,
  TenantManager,
  type TenantRepository,
  TursoStoreAdapter,
  UpstashRestRedisClient,
} from '../../tenant/src/index.js';
import { AuthService } from './auth.js';
import { QueryExecutionService } from './executor.js';
import { KillSwitch } from './kill-switch.js';
import { UsageTracker } from './limits.js';
import { ProjectService } from './project-service.js';
import { ApiRouter } from './router.js';

export interface ColtaneApiSystem {
  authService: AuthService;
  tenantRepository: TenantRepository;
  tenantManager: TenantManager;
  projectService: ProjectService;
  storeAdapter: StoreAdapter;
  tenantGuard: TenantGuard;
  killSwitch: KillSwitch;
  usageTracker: UsageTracker;
  executionService: QueryExecutionService;
  router: ApiRouter;
}

export function createColtaneApi(options: {
  storeAdapter?: StoreAdapter;
  tenantRepository?: TenantRepository;
  initialKillSwitch?: boolean;
  firestoreClient?: FirestoreClient;
  firebaseAuthClient?: FirebaseAuthClient;
} = {}): ColtaneApiSystem {
  const authService = new AuthService(options.firebaseAuthClient ?? createFirebaseAuthClientFromEnv());
  const tenantRepository = options.tenantRepository ?? new InMemoryTenantRepository();

  let storeAdapter = options.storeAdapter;
  if (!storeAdapter) {
    const memory = new InMemoryStoreAdapter(postgresCapabilities);
    const multi = new MultiBackendStoreAdapter(memory);

    // Neon Postgres
    multi.registerAdapter('neon', new NeonStoreAdapter(new InMemorySqlExecutor()));

    // Supabase Postgres
    multi.registerAdapter('supabase', new SupabaseStoreAdapter(new InMemorySqlExecutor()));

    // Upstash Redis (uses live REST client if credentials are present in environment)
    const redisRestUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const redisClient = redisRestUrl && redisRestToken
      ? new UpstashRestRedisClient(redisRestUrl, redisRestToken)
      : new InMemoryRedisClient();
    multi.registerAdapter('redis', new RedisStoreAdapter(redisClient));

    // Turso libSQL
    multi.registerAdapter('turso', new TursoStoreAdapter(new InMemoryLibsqlClient()));

    // MongoDB Atlas
    multi.registerAdapter('mongodb', new MongoStoreAdapter(new InMemoryMongoDatabase()));

    // Firebase Firestore (uses live FirebaseAdminFirestoreClient if credentials in env)
    const firestoreClient = options.firestoreClient ?? createFirestoreClientFromEnv();
    multi.registerAdapter('firestore', new FirestoreStoreAdapter(firestoreClient));

    storeAdapter = multi;
  }

  const tenantManager = new TenantManager(
    tenantRepository,
    {
      provision: async (ctx) => {
        await storeAdapter.connect(ctx);
      },
    },
  );

  const projectService = new ProjectService(tenantManager, authService);

  const tenantGuard = new TenantGuard(storeAdapter, async (tenantId) => {
    const record = await tenantRepository.find(parseTenantId(tenantId));
    if (!record) return undefined;
    return createTenantContext(record.tenantId, record.state);
  });

  const killSwitch = new KillSwitch(options.initialKillSwitch ?? false);
  const usageTracker = new UsageTracker();
  const executionService = new QueryExecutionService(tenantGuard, killSwitch, usageTracker);

  const router = new ApiRouter(
    authService,
    projectService,
    executionService,
    killSwitch,
    usageTracker,
  );

  return {
    authService,
    tenantRepository,
    tenantManager,
    projectService,
    storeAdapter,
    tenantGuard,
    killSwitch,
    usageTracker,
    executionService,
    router,
  };
}
