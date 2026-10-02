// Input limits enforced by the server and mirrored in the UI.

export const WITNESS_COUNT = 3;

export const LIMITS = {
  materialMin: 3,
  materialMax: 40_000,
  talkMax: 1_500,
  accusationMin: 10,
  accusationMax: 4_000,
} as const;
