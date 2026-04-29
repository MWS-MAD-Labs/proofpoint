// src/lib/observation-workflow.ts
import { PrismaClient, ObservationStatus, app_role } from '@prisma/client';

export enum WorkflowAction {
  CREATE = 'CREATE',
  SUBMIT = 'SUBMIT',
  ACKNOWLEDGE = 'ACKNOWLEDGE',
  REVIEW = 'REVIEW',
  RETURN = 'RETURN',
  DELETE = 'DELETE'
}

export interface WorkflowTransition {
  from: ObservationStatus;
  to: ObservationStatus;
  requiredRole: app_role[];
  action: WorkflowAction;
  description: string;
}

export const WORKFLOW_TRANSITIONS: WorkflowTransition[] = [
  {
    from: 'draft',
    to: 'submitted',
    requiredRole: ['manager', 'admin'],
    action: WorkflowAction.SUBMIT,
    description: 'Manager fills and submits observation'
  },
  {
    from: 'submitted',
    to: 'acknowledged',
    requiredRole: ['staff', 'admin'],
    action: WorkflowAction.ACKNOWLEDGE,
    description: 'Staff acknowledges the observation'
  },
  {
    from: 'submitted',
    to: 'reviewed',
    requiredRole: ['director', 'admin'],
    action: WorkflowAction.REVIEW,
    description: 'Director reviews the submitted observation'
  },
  {
    from: 'pending',
    to: 'submitted',
    requiredRole: ['manager', 'admin'],
    action: WorkflowAction.SUBMIT,
    description: 'Manager fills pending observation'
  },
  {
    from: 'acknowledged',
    to: 'reviewed',
    requiredRole: ['director', 'admin'],
    action: WorkflowAction.REVIEW,
    description: 'Director reviews acknowledged observation'
  }
];

export function getAllowedActions(
  currentStatus: ObservationStatus,
  userRole: app_role
): WorkflowAction[] {
  return WORKFLOW_TRANSITIONS
    .filter(t => t.from === currentStatus && t.requiredRole.includes(userRole))
    .map(t => t.action);
}

export function getTargetStatus(
  currentStatus: ObservationStatus,
  action: WorkflowAction
): ObservationStatus | null {
  const transition = WORKFLOW_TRANSITIONS.find(
    t => t.from === currentStatus && t.action === action
  );
  return transition?.to || null;
}

export function isTransitionAllowed(
  fromStatus: ObservationStatus,
  toStatus: ObservationStatus,
  userRole: app_role
): boolean {
  return WORKFLOW_TRANSITIONS.some(
    t => t.from === fromStatus && t.to === toStatus && t.requiredRole.includes(userRole)
  );
}

export class ObservationWorkflowService {
  constructor(private prisma: PrismaClient) {}

  async createObservation(
    staffId: string,
    rubricId: string,
    createdBy: string,
    userRole: string,
    metadata?: { title?: string; description?: string }
  ) {
    if (!['admin', 'manager', 'director'].includes(userRole)) {
      throw new Error('Only admin/manager/director can create observations');
    }

    const staff = await this.prisma.user.findUnique({
      where: { id: staffId },
      include: { profile: true }
    });

    if (!staff) throw new Error('Staff not found');

    const rubric = await this.prisma.rubricTemplate.findUnique({
      where: { id: rubricId }
    });

    if (!rubric) throw new Error('Rubric not found');

    const observation = await this.prisma.$transaction(async (tx) => {
      const obs = await tx.observation.create({
        data: {
          staffId,
          managerId: createdBy,
          rubricId,
          status: 'draft',
          type: 'MANAGER',
          title: metadata?.title || `Observation - ${staff.profile?.fullName || staff.email}`,
          description: metadata?.description || ''
        },
        include: {
          staff: { include: { profile: true } },
          manager: { include: { profile: true } },
          rubric: { include: { sections: { include: { indicators: true } } } }
        }
      });

      // Create answers untuk setiap indicator
      const answers = [];
      for (const section of obs.rubric.sections) {
        for (const indicator of section.indicators) {
          answers.push({
            observationId: obs.id,
            indicatorId: indicator.id,
            score: 0,
            note: ''
          });
        }
      }

      if (answers.length > 0) {
        await tx.observationAnswer.createMany({ data: answers, skipDuplicates: true });
      }

      return obs;
    });

    return observation;
  }

  async submitObservation(
    observationId: string,
    answers: Array<{ indicatorId: string; score: number; note: string }>,
    submittedBy: string,
    userRole: string
  ) {
    const observation = await this.prisma.observation.findUnique({
      where: { id: observationId },
      include: { manager: true, staff: { include: { profile: true } } }
    });

    if (!observation) throw new Error('Observation not found');

    if (!['manager', 'admin'].includes(userRole)) {
      throw new Error('Only manager/admin can submit observations');
    }

    if (userRole === 'manager' && observation.managerId !== submittedBy) {
      throw new Error('You can only submit your assigned observations');
    }

    const previousStatus = observation.status; // ✅ Simpan status sebelumnya untuk audit trail

    const updated = await this.prisma.$transaction(async (tx) => {
      // Update jawaban tiap indicator
      for (const answer of answers) {
        await tx.observationAnswer.update({
          where: {
            observationId_indicatorId: { observationId, indicatorId: answer.indicatorId }
          },
          data: { score: answer.score, note: answer.note }
        });
      }

      // Update status observation ke submitted
      const obs = await tx.observation.update({
        where: { id: observationId },
        data: { status: 'submitted', submittedAt: new Date() },
        include: { staff: { include: { profile: true } } }
      });

      // ✅ FIX #2: Simpan riwayat perubahan status (audit trail)
      await tx.observationUpdate.create({
        data: {
          observationId: observationId,
          updatedById: submittedBy,
          statusFrom: previousStatus,
          statusTo: 'submitted',
          notes: `Observation submitted by ${userRole}`
        }
      });

      return obs;
    });

    return updated;
  }

  async acknowledgeObservation(
    observationId: string,
    acknowledgedBy: string,
    userRole: string,
    feedback?: string
  ) {
    const observation = await this.prisma.observation.findUnique({
      where: { id: observationId },
      include: { staff: true }
    });

    if (!observation) throw new Error('Observation not found');

    if (!['staff', 'admin'].includes(userRole)) {
      throw new Error('Only staff/admin can acknowledge observations');
    }

    if (userRole === 'staff' && observation.staffId !== acknowledgedBy) {
      throw new Error('You can only acknowledge observations about yourself');
    }

    const previousStatus = observation.status; // ✅ Simpan status sebelumnya untuk audit trail

    const updated = await this.prisma.$transaction(async (tx) => {
      // Update status observation ke acknowledged
      const obs = await tx.observation.update({
        where: { id: observationId },
        data: {
          status: 'acknowledged',
          acknowledgedAt: new Date(),
          acknowledgedBy: acknowledgedBy
        },
        include: { staff: { include: { profile: true } } }
      });

      // ✅ FIX #2: Simpan riwayat perubahan status (audit trail)
      await tx.observationUpdate.create({
        data: {
          observationId: observationId,
          updatedById: acknowledgedBy,
          statusFrom: previousStatus,
          statusTo: 'acknowledged',
          notes: feedback || `Observation acknowledged by ${userRole}`
        }
      });

      return obs;
    });

    return updated;
  }

  async getObservationHistory(observationId: string) {
    return await this.prisma.observationUpdate.findMany({
      where: { observationId },
      include: { updatedBy: { include: { profile: true } } },
      orderBy: { createdAt: 'asc' }
    });
  }

  async getAvailableActions(observationId: string, userRole: string): Promise<WorkflowAction[]> {
    const observation = await this.prisma.observation.findUnique({
      where: { id: observationId }
    });
    if (!observation) throw new Error('Observation not found');
    return getAllowedActions(observation.status, userRole as app_role);
  }
}

export default ObservationWorkflowService;
