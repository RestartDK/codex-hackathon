import { describe, expect, it } from "vite-plus/test";
import { ActionDelivery } from "./actionDelivery";
describe("uncertain game action delivery", () => {
  it("reuses a receipt after a lost response and blocks conflicting choices", () => {
    const delivery = new ActionDelivery();
    const first = delivery.request("a", { type: "night", target: "emma" });
    expect(delivery.request("a", { type: "night", target: "emma" }).requestId).toBe(
      first.requestId,
    );
    expect(() => delivery.request("a", { type: "night", target: "lucas" })).toThrow(
      "retry last move",
    );
    delivery.confirmed(first.requestId);
    expect(delivery.request("a", { type: "night", target: "lucas" }).requestId).not.toBe(
      first.requestId,
    );
  });
  it("does not let a late result clear a newer game's pending action", () => {
    const delivery = new ActionDelivery();
    const old = delivery.request("a", { type: "vote", target: "emma" });
    const next = delivery.request("b", { type: "night" });
    delivery.confirmed(old.requestId);
    expect(delivery.pending).toBe(next);
  });
});
