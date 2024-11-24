import { validTypes } from '../types/job';

export const addJobSchema = {
  body: {
    type: 'object',
    required: ['type', 'content', 'groups', 'users', 'tags', 'externalId'],
    properties: {
      type: {
        type: 'string',
        enum: validTypes,
      },
      content: { type: 'string' },
      groups: {
        type: 'array',
        items: { type: 'string' },
      },
      users: {
        type: 'array',
        items: { type: 'string' },
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
      },
      urls: {
        type: 'array',
        items: { type: 'string' },
      },
      externalId: { type: 'string' },
      hashSuffix: { type: 'string' },
    },
  },
};

export const bulkAddJobSchema = {
  body: {
    type: 'object',
    required: ['jobs'],
    properties: {
      jobs: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'type',
            'content',
            'groups',
            'users',
            'tags',
            'externalId',
          ],
          properties: {
            type: {
              type: 'string',
              enum: validTypes,
            },
            content: { type: 'string' },
            groups: {
              type: 'array',
              items: { type: 'string' },
            },
            users: {
              type: 'array',
              items: { type: 'string' },
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
            },
            urls: {
              type: 'array',
              items: { type: 'string' },
            },
            externalId: { type: 'string' },
            hashSuffix: { type: 'string' },
          },
        },
        minItems: 1,
      },
    },
  },
};

export const deleteEmbeddingSchema = {
  body: {
    type: 'object',
    required: ['contentHash', 'type'],
    properties: {
      contentHash: { type: 'string' },
      type: {
        type: 'string',
        enum: validTypes,
      },
    },
  },
};

export const isGrantUpdateSchema = {
  body: {
    type: 'object',
    required: ['jobs'],
    properties: {
      jobs: {
        type: 'array',
        items: {
          type: 'object',
          required: ['castHash', 'builderFid', 'urls'],
          properties: {
            castContent: { type: 'string', default: '' },
            castHash: { type: 'string' },
            builderFid: { type: 'string' },
            urls: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        minItems: 1,
      },
    },
  },
};

export const builderProfileSchema = {
  body: {
    type: 'object',
    required: ['jobs'],
    properties: {
      jobs: {
        type: 'array',
        items: {
          type: 'object',
          required: ['fid'],
          properties: {
            fid: { type: 'string' },
          },
        },
        minItems: 1,
      },
    },
  },
};

export const storySchema = {
  body: {
    type: 'object',
    required: ['jobs'],
    properties: {
      jobs: {
        type: 'array',
        items: {
          type: 'object',
          required: ['newCastId', 'grantId'],
          properties: {
            newCastId: { type: 'number' },
            grantId: { type: 'string' },
          },
        },
        minItems: 1,
      },
    },
  },
};
