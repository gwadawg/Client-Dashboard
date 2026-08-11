import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeVerticalEffort } from "./agent-vertical-effort";

describe("computeVerticalEffort", () => {
  const clients = [
    { id: "c-rm", name: "Reverse Co", reporting_type: "RM" },
    { id: "c-rev", name: "Also Reverse", reporting_type: "reverse mortgage" },
    { id: "c-dscr", name: "DSCR Shop", reporting_type: "DSCR" },
    { id: "c-he", name: "HE Book", reporting_type: "HE" },
    { id: "c-cc", name: "CC Book", reporting_type: "CALL_CENTER" },
  ];

  it("buckets dials by reporting type with HE → CALL_CENTER and reverse aliases", () => {
    const events = [
      { event_type: "dial", client_id: "c-rm", is_pickup: true, is_conversation: false },
      { event_type: "dial", client_id: "c-rev", is_pickup: false, is_conversation: false },
      { event_type: "dial", client_id: "c-dscr", is_pickup: true, is_conversation: true },
      { event_type: "dial", client_id: "c-he", is_pickup: true, is_conversation: false },
      { event_type: "dial", client_id: "c-cc", is_pickup: false, is_conversation: false },
      { event_type: "appointment_booked", client_id: "c-rm", is_pickup: null, is_conversation: null },
    ];

    const result = computeVerticalEffort(events, clients);

    assert.equal(result.by_type.RM.dials, 2);
    assert.equal(result.by_type.RM.pickups, 1);
    assert.equal(result.by_type.DSCR.dials, 1);
    assert.equal(result.by_type.DSCR.conversations, 1);
    assert.equal(result.by_type.CALL_CENTER.dials, 2);
    assert.equal(result.total_attributed_dials, 5);
    assert.equal(result.unattributed.dials, 0);
  });

  it("counts missing client_id as unattributed", () => {
    const events = [
      { event_type: "dial", client_id: null, is_pickup: true, is_conversation: false },
      { event_type: "dial", client_id: "  ", is_pickup: false, is_conversation: false },
      { event_type: "dial", client_id: "c-rm", is_pickup: false, is_conversation: false },
    ];

    const result = computeVerticalEffort(events, clients);
    assert.equal(result.unattributed.dials, 2);
    assert.equal(result.by_type.RM.dials, 1);
    assert.equal(result.total_attributed_dials, 1);
  });

  it("returns top clients sorted by dials within each vertical", () => {
    const many = [
      { id: "a", name: "A", reporting_type: "DSCR" },
      { id: "b", name: "B", reporting_type: "DSCR" },
      { id: "c", name: "C", reporting_type: "DSCR" },
    ];
    const events = [
      ...Array.from({ length: 5 }, () => ({
        event_type: "dial" as const,
        client_id: "b",
        is_pickup: false,
        is_conversation: false,
      })),
      ...Array.from({ length: 3 }, () => ({
        event_type: "dial" as const,
        client_id: "a",
        is_pickup: true,
        is_conversation: false,
      })),
      { event_type: "dial" as const, client_id: "c", is_pickup: false, is_conversation: false },
    ];

    const result = computeVerticalEffort(events, many, 2);
    assert.deepEqual(
      result.by_type.DSCR.clients.map(x => x.client_id),
      ["b", "a"],
    );
    assert.equal(result.by_type.DSCR.clients[0].dials, 5);
  });
});
