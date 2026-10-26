type PendingAction = { gameId: string; input: Record<string, unknown>; requestId: string };

/** Keep the same server receipt key when the connection loses a move's result. */
export class ActionDelivery {
  pending: PendingAction | undefined;
  request(gameId: string, input: Record<string, unknown>): PendingAction {
    if (this.pending?.gameId !== gameId) this.pending = undefined;
    if (this.pending && JSON.stringify(this.pending.input) !== JSON.stringify(input))
      throw new Error(
        "The previous move's result is not confirmed. Say retry last move before making a different choice.",
      );
    return (this.pending ??= {
      gameId,
      input: structuredClone(input),
      requestId: crypto.randomUUID(),
    });
  }
  confirmed(requestId: string) {
    if (this.pending?.requestId === requestId) this.pending = undefined;
  }
}
