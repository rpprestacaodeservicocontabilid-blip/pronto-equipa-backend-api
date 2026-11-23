import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { AiValidationError } from '../errors/ai-domain.error';
import { AiActionRisk } from '../value-objects/ai-action-risk.vo';
import { AiToolName } from '../value-objects/ai-tool-name.vo';
import { AiToolVersion } from '../value-objects/ai-tool-version.vo';

export interface AiToolDefinitionProps {
  id: string;
  name: string;
  version: string;
  module: string;
  description: string;
  riskLevel: string;
  requiredPermissions: string[];
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  status: 'ACTIVE' | 'DISABLED';
  disabledReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAiToolDefinitionInput {
  name: string;
  version?: string;
  description: string;
  riskLevel: string;
  requiredPermissions: string[];
  requiresConfirmation?: boolean;
  requiresApproval?: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  id?: string;
  now?: Date;
}

/**
 * Defiinição registada de uma ferramenta do catálogo (secção 11,
 * RF-AI-041/042/044).
 *
 * Invariantes:
 *  - ferramentas de escrita exigem política explícita (RN-AI-016);
 *  - o modelo nunca altera a definição de uma ferramenta;
 *  - uma ferramenta desactivada não pode ser executada (CA-AI-028);
 *  - não existem ferramentas genéricas (`executeSql`, `runShellCommand`,
 *    `updateAnyRecord`, `bypassAuthorization`).
 */
const FORBIDDEN_TOOL_NAMES = new Set([
  'executeSql',
  'executesql',
  'runShellCommand',
  'runshellcommand',
  'updateAnyRecord',
  'updateanyrecord',
  'bypassAuthorization',
  'bypassauthorization',
]);

export class AiToolDefinition extends AggregateRoot<AiToolDefinitionProps> {
  private constructor(props: AiToolDefinitionProps) {
    super(props);
  }

  static create(input: CreateAiToolDefinitionInput): AiToolDefinition {
    const name = AiToolName.create(input.name);
    if (FORBIDDEN_TOOL_NAMES.has(name.value.replace(/\./g, '')))
      throw new AiValidationError(`Ferramenta não permitida: ${name.value}.`);

    const risk = AiActionRisk.from(input.riskLevel);
    const version = AiToolVersion.create(input.version ?? AiToolVersion.current().toString());
    const permissions = [...new Set(input.requiredPermissions ?? [])].map((permission) => {
      const normalized = String(permission ?? '').trim();
      if (!normalized) throw new AiValidationError('Permissão de ferramenta inválida.');
      return normalized;
    });

    const requiresApproval = input.requiresApproval ?? risk.requiresApproval;
    const requiresConfirmation = input.requiresConfirmation ?? risk.requiresConfirmation;

    // Invariante: ferramentas de escrita exigem política explícita.
    if (risk.isWrite && !requiresConfirmation && !requiresApproval)
      throw new AiValidationError(
        `A ferramenta ${name.value} é de escrita e exige confirmação ou aprovação.`,
      );

    const now = input.now ?? new Date();
    return new AiToolDefinition({
      id: input.id ?? randomUUID(),
      name: name.value,
      version: version.toString(),
      module: name.module,
      description: String(input.description ?? '').trim(),
      riskLevel: risk.value,
      requiredPermissions: permissions,
      requiresConfirmation,
      requiresApproval,
      inputSchema: input.inputSchema ?? {},
      outputSchema: input.outputSchema ?? {},
      status: 'ACTIVE',
      disabledReason: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: AiToolDefinitionProps): AiToolDefinition {
    return new AiToolDefinition({
      ...props,
      requiredPermissions: [...(props.requiredPermissions ?? [])],
    });
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get version(): string {
    return this.props.version;
  }

  get module(): string {
    return this.props.module;
  }

  get risk(): AiActionRisk {
    return AiActionRisk.from(this.props.riskLevel);
  }

  get status(): AiToolDefinitionProps['status'] {
    return this.props.status;
  }

  get requiredPermissions(): readonly string[] {
    return this.props.requiredPermissions;
  }

  get requiresConfirmation(): boolean {
    return this.props.requiresConfirmation;
  }

  get requiresApproval(): boolean {
    return this.props.requiresApproval;
  }

  get inputSchema(): Record<string, unknown> {
    return this.props.inputSchema;
  }

  get outputSchema(): Record<string, unknown> {
    return this.props.outputSchema;
  }

  get description(): string {
    return this.props.description;
  }

  get disabledReason(): string | null {
    return this.props.disabledReason;
  }

  get isActive(): boolean {
    return this.props.status === 'ACTIVE';
  }

  /** Versão compatível (mesmo major) — RF-AI-042. */
  matchesVersion(version: string): boolean {
    return AiToolVersion.create(this.props.version).isCompatibleWith(AiToolVersion.create(version));
  }

  /** Ferramenta disponível: activa e com permissões solicitadas. */
  isAvailableFor(grantedPermissions: readonly string[]): boolean {
    return (
      this.isActive &&
      this.props.requiredPermissions.every((permission) => grantedPermissions.includes(permission))
    );
  }

  disable(reason: string, now = new Date()): AiToolDefinitionProps {
    if (!this.isActive) return this.propsSnapshot;
    const normalized = String(reason ?? '').trim();
    if (!normalized) throw new AiValidationError('Indique o motivo da desactivação.');
    this.props.status = 'DISABLED';
    this.props.disabledReason = normalized.slice(0, 300);
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  enable(now = new Date()): AiToolDefinitionProps {
    this.props.status = 'ACTIVE';
    this.props.disabledReason = null;
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  public get propsSnapshot(): AiToolDefinitionProps {
    return { ...this.props, requiredPermissions: [...this.props.requiredPermissions] };
  }
}
