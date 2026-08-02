import { ERROR_CODES } from '@familystar/shared';
import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { SESSION_TTL_SECONDS } from '../family-auth/constants.js';
import { createErrorResponse, createSuccessResponse } from '../http/responses.js';
import type { AppEnvironment } from '../http/types.js';
import {
  InvalidTaskTypeError,
  PresetTaskTypeDeleteError,
  TaskTypeDeleteConflictError,
  TaskTypeNotFoundError,
  TaskTypeSessionRequiredError,
} from './task-type-service.js';
import {
  ChildTaskSessionRequiredError,
  InvalidTaskError,
  TaskNotFoundError,
  TaskSessionRequiredError,
  TaskStateConflictError,
} from './task-service.js';
import type {
  ChildTaskRecord,
  TaskAssignmentInput,
  TaskCreateInput,
  TaskFrequency,
  TaskOperations,
  TaskPatch,
  TaskRecord,
  TaskTypeOperations,
} from './types.js';

const verifyModes = z.enum(['AUTO', 'MANUAL']);
const taskTypeInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    icon: z.string().trim().min(1).max(80),
    default_verify_mode: verifyModes.optional(),
    sort_order: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();
const taskTypePatch = taskTypeInput.partial().refine((value) => Object.keys(value).length > 0);
const frequencySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily') }).strict(),
  z.object({ kind: z.literal('weekly_count'), count: z.number().int().min(1).max(7) }).strict(),
  z
    .object({
      kind: z.literal('weekdays'),
      weekdays: z.array(z.number().int().min(1).max(7)).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('date_range'),
      start_date: z.string().date(),
      end_date: z.string().date(),
    })
    .strict(),
]);
const assignmentSchema = z
  .object({
    child_id: z.string().min(1),
    custom_points: z.number().int().positive().optional(),
    custom_frequency: frequencySchema.optional(),
    custom_check_type: z.enum(['TICK', 'TEXT', 'PHOTO', 'VIDEO', 'MIXED']).optional(),
    custom_verify_mode: verifyModes.optional(),
    start_date: z.string().date(),
    end_date: z.string().date().optional(),
  })
  .strict();
const taskInput = z
  .object({
    task_type_id: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).optional(),
    submission_guide: z.string().trim().min(1).optional(),
    check_type: z.enum(['TICK', 'TEXT', 'PHOTO', 'VIDEO', 'MIXED']),
    verify_mode: verifyModes.optional(),
    collaboration_mode: z.enum(['SOLO', 'COLLAB']).optional(),
    frequency: frequencySchema,
    base_points: z.number().int().positive(),
    assignments: z.array(assignmentSchema).min(1),
  })
  .strict();
const taskPatch = taskInput
  .extend({
    description: z.string().trim().min(1).nullable().optional(),
    submission_guide: z.string().trim().min(1).nullable().optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const childTaskDate = z.string().date();

async function readJson(context: Context<AppEnvironment>): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

function token(context: Context<AppEnvironment>): string | undefined {
  return getCookie(context, 'familystar_session');
}

function sessionInput(context: Context<AppEnvironment>): { sessionToken?: string } {
  const value = token(context);
  return value === undefined ? {} : { sessionToken: value };
}

function renew(context: Context<AppEnvironment>, secure: boolean): void {
  const value = token(context);
  if (!value) return;
  setCookie(context, 'familystar_session', value, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    sameSite: 'Lax',
    secure,
  });
}

function output(value: Readonly<Record<string, unknown>>) {
  return {
    id: value.id,
    family_id: value.familyId,
    template_code: value.templateCode,
    name: value.name,
    icon: value.icon,
    default_verify_mode: value.defaultVerifyMode,
    is_enabled: value.isEnabled,
    sort_order: value.sortOrder,
  };
}

function mapError(context: Context<AppEnvironment>, error: unknown) {
  const requestId = context.get('requestId');
  if (error instanceof TaskTypeSessionRequiredError) {
    return context.json(
      createErrorResponse(ERROR_CODES.UNAUTHORIZED, error.message, requestId),
      401,
    );
  }
  if (error instanceof TaskTypeNotFoundError) {
    return context.json(createErrorResponse(ERROR_CODES.NOT_FOUND, error.message, requestId), 404);
  }
  if (error instanceof InvalidTaskTypeError) {
    return context.json(
      createErrorResponse(ERROR_CODES.INVALID_REQUEST, error.message, requestId),
      400,
    );
  }
  if (error instanceof PresetTaskTypeDeleteError || error instanceof TaskTypeDeleteConflictError) {
    const details =
      error instanceof TaskTypeDeleteConflictError ? { task_count: error.taskCount } : undefined;
    return context.json(
      createErrorResponse(
        ERROR_CODES.CONFLICT,
        error.message,
        requestId,
        new Date().toISOString(),
        details,
      ),
      409,
    );
  }
  if (error instanceof TaskSessionRequiredError) {
    return context.json(
      createErrorResponse(ERROR_CODES.UNAUTHORIZED, error.message, requestId),
      401,
    );
  }
  if (error instanceof ChildTaskSessionRequiredError) {
    return context.json(
      createErrorResponse(ERROR_CODES.UNAUTHORIZED, error.message, requestId),
      401,
    );
  }
  if (error instanceof TaskNotFoundError) {
    return context.json(createErrorResponse(ERROR_CODES.NOT_FOUND, error.message, requestId), 404);
  }
  if (error instanceof InvalidTaskError) {
    return context.json(
      createErrorResponse(ERROR_CODES.INVALID_REQUEST, error.message, requestId),
      400,
    );
  }
  if (error instanceof TaskStateConflictError) {
    return context.json(createErrorResponse(ERROR_CODES.CONFLICT, error.message, requestId), 409);
  }
  throw error;
}

function frequencyInput(value: z.infer<typeof frequencySchema>): TaskFrequency {
  return value.kind === 'date_range'
    ? { kind: value.kind, startDate: value.start_date, endDate: value.end_date }
    : value;
}

function assignmentInput(value: z.infer<typeof assignmentSchema>): TaskAssignmentInput {
  return {
    childId: value.child_id,
    startDate: value.start_date,
    ...(value.end_date === undefined ? {} : { endDate: value.end_date }),
    ...(value.custom_points === undefined ? {} : { customPoints: value.custom_points }),
    ...(value.custom_frequency === undefined
      ? {}
      : { customFrequency: frequencyInput(value.custom_frequency) }),
    ...(value.custom_check_type === undefined ? {} : { customCheckType: value.custom_check_type }),
    ...(value.custom_verify_mode === undefined
      ? {}
      : { customVerifyMode: value.custom_verify_mode }),
  };
}

function createTaskInput(value: z.infer<typeof taskInput>): TaskCreateInput {
  return {
    taskTypeId: value.task_type_id,
    name: value.name,
    checkType: value.check_type,
    frequency: frequencyInput(value.frequency),
    basePoints: value.base_points,
    assignments: value.assignments.map(assignmentInput),
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.submission_guide === undefined ? {} : { submissionGuide: value.submission_guide }),
    ...(value.verify_mode === undefined ? {} : { verifyMode: value.verify_mode }),
    ...(value.collaboration_mode === undefined
      ? {}
      : { collaborationMode: value.collaboration_mode }),
  };
}

function patchTaskInput(value: z.infer<typeof taskPatch>): TaskPatch {
  return {
    ...(value.task_type_id === undefined ? {} : { taskTypeId: value.task_type_id }),
    ...(value.name === undefined ? {} : { name: value.name }),
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.submission_guide === undefined ? {} : { submissionGuide: value.submission_guide }),
    ...(value.check_type === undefined ? {} : { checkType: value.check_type }),
    ...(value.verify_mode === undefined ? {} : { verifyMode: value.verify_mode }),
    ...(value.collaboration_mode === undefined
      ? {}
      : { collaborationMode: value.collaboration_mode }),
    ...(value.frequency === undefined ? {} : { frequency: frequencyInput(value.frequency) }),
    ...(value.base_points === undefined ? {} : { basePoints: value.base_points }),
    ...(value.assignments === undefined
      ? {}
      : { assignments: value.assignments.map(assignmentInput) }),
  };
}

function outputFrequency(value: TaskFrequency) {
  return value.kind === 'date_range'
    ? { kind: value.kind, start_date: value.startDate, end_date: value.endDate }
    : value;
}

function outputTask(value: TaskRecord) {
  return {
    id: value.id,
    family_id: value.familyId,
    task_type_id: value.taskTypeId,
    name: value.name,
    description: value.description,
    submission_guide: value.submissionGuide,
    check_type: value.checkType,
    verify_mode: value.verifyMode,
    collaboration_mode: value.collaborationMode,
    frequency: outputFrequency(value.frequency),
    base_points: value.basePoints,
    status: value.status,
    assignments: value.assignments.map((assignment) => ({
      id: assignment.id,
      child_id: assignment.childId,
      custom_points: assignment.customPoints,
      custom_frequency:
        assignment.customFrequency === undefined
          ? undefined
          : outputFrequency(assignment.customFrequency),
      custom_check_type: assignment.customCheckType,
      custom_verify_mode: assignment.customVerifyMode,
      start_date: assignment.startDate,
      end_date: assignment.endDate,
    })),
  };
}

function outputChildTask(value: ChildTaskRecord) {
  return {
    task_id: value.taskId,
    task_assignment_id: value.taskAssignmentId,
    name: value.name,
    description: value.description,
    submission_guide: value.submissionGuide,
    collaboration_mode: value.collaborationMode,
    frequency: outputFrequency(value.frequency),
    points: value.points,
    check_type: value.checkType,
    verify_mode: value.verifyMode,
    start_date: value.startDate,
    end_date: value.endDate,
  };
}

export function registerTaskTypeRoutes(
  api: Hono<AppEnvironment>,
  operations: TaskTypeOperations,
  secureCookies: boolean,
): void {
  api.get('/family/task-types', async (context) => {
    try {
      const result = await operations.list(sessionInput(context));
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { task_types: result.taskTypes.map(output) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.post('/family/task-types', async (context) => {
    const parsed = taskTypeInput.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid task type request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await operations.create({
        ...sessionInput(context),
        taskType: {
          name: parsed.data.name,
          icon: parsed.data.icon,
          ...(parsed.data.default_verify_mode === undefined
            ? {}
            : { defaultVerifyMode: parsed.data.default_verify_mode }),
          ...(parsed.data.sort_order === undefined ? {} : { sortOrder: parsed.data.sort_order }),
        },
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ task_type: output(result.taskType) }, context.get('requestId')),
        201,
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/family/task-types/:taskTypeId', async (context) => {
    const parsed = taskTypePatch.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid task type request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await operations.update({
        ...sessionInput(context),
        taskTypeId: context.req.param('taskTypeId'),
        taskType: {
          ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
          ...(parsed.data.icon === undefined ? {} : { icon: parsed.data.icon }),
          ...(parsed.data.default_verify_mode === undefined
            ? {}
            : { defaultVerifyMode: parsed.data.default_verify_mode }),
          ...(parsed.data.sort_order === undefined ? {} : { sortOrder: parsed.data.sort_order }),
        },
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ task_type: output(result.taskType) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.delete('/family/task-types/:taskTypeId', async (context) => {
    try {
      await operations.remove({
        ...sessionInput(context),
        taskTypeId: context.req.param('taskTypeId'),
      });
      renew(context, secureCookies);
      return context.body(null, 204);
    } catch (error) {
      return mapError(context, error);
    }
  });
}

export function registerTaskRoutes(
  api: Hono<AppEnvironment>,
  operations: TaskOperations,
  secureCookies: boolean,
): void {
  api.get('/tasks/me', async (context) => {
    const parsedDate = childTaskDate.safeParse(
      context.req.query('date') ?? new Date().toISOString().slice(0, 10),
    );
    if (!parsedDate.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid task date.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await operations.listMine({
        ...sessionInput(context),
        date: parsedDate.data,
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse(
          { date: result.date, tasks: result.tasks.map(outputChildTask) },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.get('/family/tasks', async (context) => {
    try {
      const result = await operations.list(sessionInput(context));
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ tasks: result.tasks.map(outputTask) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.post('/family/tasks', async (context) => {
    const parsed = taskInput.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid task request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await operations.create({
        ...sessionInput(context),
        task: createTaskInput(parsed.data),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ task: outputTask(result.task) }, context.get('requestId')),
        201,
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  api.patch('/family/tasks/:taskId', async (context) => {
    const parsed = taskPatch.safeParse(await readJson(context));
    if (!parsed.success) {
      return context.json(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid task request.',
          context.get('requestId'),
        ),
        400,
      );
    }
    try {
      const result = await operations.update({
        ...sessionInput(context),
        taskId: context.req.param('taskId'),
        task: patchTaskInput(parsed.data),
      });
      renew(context, secureCookies);
      return context.json(
        createSuccessResponse({ task: outputTask(result.task) }, context.get('requestId')),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  for (const [action, status] of [
    ['activate', 'ACTIVE'],
    ['deactivate', 'INACTIVE'],
    ['archive', 'ARCHIVED'],
  ] as const) {
    api.post(`/family/tasks/:taskId/${action}`, async (context) => {
      try {
        const result = await operations.setStatus({
          ...sessionInput(context),
          taskId: context.req.param('taskId'),
          status,
        });
        renew(context, secureCookies);
        return context.json(
          createSuccessResponse({ task: outputTask(result.task) }, context.get('requestId')),
        );
      } catch (error) {
        return mapError(context, error);
      }
    });
  }
}
