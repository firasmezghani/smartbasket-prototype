// The signed-in account plus a number that changes on every account switch.

export type AccountScope = {
  accountId: string | null;
  generation: number;
};

export function captureAccountScope(accountId: string | null | undefined, generation: number): AccountScope {
  return {
    accountId: accountId == null ? null : String(accountId),
    generation,
  };
}

export function isCurrentAccountScope(started: AccountScope, current: AccountScope): boolean {
  return started.generation === current.generation && started.accountId === current.accountId;
}
