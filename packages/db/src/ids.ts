/** Stable ids so re-seeding updates the demo rows instead of inserting duplicates. */
export const SEED_IDS = {
  user: '018f6b10-7c3a-7a21-8000-000000000001',
  editor: '018f6b10-7c3a-7a21-8000-000000000002',
  viewer: '018f6b10-7c3a-7a21-8000-000000000003',
  groups: {
    all: '018f6b10-7c3a-7a21-8000-000000000101',
    hn: '018f6b10-7c3a-7a21-8000-000000000102',
    adp: '018f6b10-7c3a-7a21-8000-000000000103',
    fin: '018f6b10-7c3a-7a21-8000-000000000104',
    comms: '018f6b10-7c3a-7a21-8000-000000000105',
    lead: '018f6b10-7c3a-7a21-8000-000000000106',
  },
  announcements: {
    report: '018f6b10-7c3a-7a21-8000-000000000201',
    training: '018f6b10-7c3a-7a21-8000-000000000202',
    network: '018f6b10-7c3a-7a21-8000-000000000203',
    tet: '018f6b10-7c3a-7a21-8000-000000000204',
    receipts: '018f6b10-7c3a-7a21-8000-000000000205',
    newsletter: '018f6b10-7c3a-7a21-8000-000000000206',
    meeting: '018f6b10-7c3a-7a21-8000-000000000207',
  },
  deliveries: {
    newsletter1: '018f6b10-7c3a-7a21-8000-000000000301',
    report1: '018f6b10-7c3a-7a21-8000-000000000302',
    meeting1: '018f6b10-7c3a-7a21-8000-000000000303',
    newsletter2: '018f6b10-7c3a-7a21-8000-000000000304',
    receipts1: '018f6b10-7c3a-7a21-8000-000000000305',
    newsletter3: '018f6b10-7c3a-7a21-8000-000000000306',
  },
} as const;
