import type { CreateProjectRequest, Project, ProjectLimits } from '../../api-types/src/index.js';
import type { TenantId } from '../../tenant/src/index.js';
import { TenantManager } from '../../tenant/src/index.js';
import { AuthService } from './auth.js';
import { defaultAlphaLimits } from './limits.js';

export class ProjectService {
  private readonly projects = new Map<TenantId, Project>();

  constructor(
    private readonly tenantManager: TenantManager,
    private readonly authService: AuthService,
  ) {}

  async createProject(input: CreateProjectRequest): Promise<Project> {
    // If inviteCode is supplied, verify it
    if (input.inviteCode) {
      const inviteResult = this.authService.verifyInvite(input.inviteCode, input.ownerId);
      if (!inviteResult.valid) {
        throw new Error(`Invite verification failed: ${inviteResult.error}`);
      }
    }

    const tenant = await this.tenantManager.createTenant({
      name: input.name,
      ownerId: input.ownerId,
      limitsProfile: input.limitsProfile ?? 'alpha',
    });

    const limits: ProjectLimits = { ...defaultAlphaLimits };

    const project: Project = {
      tenantId: tenant.tenantId,
      name: tenant.name,
      ownerId: tenant.ownerId,
      state: tenant.state,
      limitsProfile: tenant.limitsProfile,
      limits,
      createdAt: tenant.createdAt,
    };

    this.projects.set(tenant.tenantId, project);
    return project;
  }

  async getProject(tenantId: string): Promise<Project | undefined> {
    const project = this.projects.get(tenantId as TenantId);
    if (!project) return undefined;
    const currentTenant = await this.tenantManager.describeTenant(tenantId);
    project.state = currentTenant.state;
    return project;
  }

  async listProjectsForOwner(ownerId: string): Promise<Project[]> {
    return [...this.projects.values()].filter((p) => p.ownerId === ownerId);
  }
}
