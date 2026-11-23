/**
 * DTOs das interacções, ferramentas e acções (secção 10,
 * RF-AI-041 a RF-AI-050).
 */
export interface AiInteractionView {
  id: string;
  conversationId: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  modelId: string | null;
  providerId: string | null;
  inputTokens: number;
  outputTokens: number;
  toolCallCount: number;
  citationCount: number;
  failureReason: string | null;
}

export interface AiToolView {
  name: string;
  version: string;
  module: string;
  description: string;
  riskLevel: string;
  requiredPermissions: string[];
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  isActive: boolean;
  available: boolean;
}

export interface AiToolExecutionView {
  id: string;
  toolName: string;
  toolVersion: string;
  status: string;
  interactionId: string | null;
  failureReason: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface AiActionProposalView {
  id: string;
  interactionId: string;
  toolName: string;
  toolVersion: string;
  riskLevel: string;
  status: string;
  arguments: Record<string, unknown>;
  actionHash: string;
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  proposedBy: number;
  confirmedBy: number | null;
  approvedBy: number | null;
  rejectedBy: number | null;
  decisionReason: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface AiFeedbackRequest {
  rating: number;
  comment?: string;
  category?: string;
}
