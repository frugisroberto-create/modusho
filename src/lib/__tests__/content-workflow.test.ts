import { describe, it, expect } from "vitest";
import {
  getSubmitTargetStatus,
  getAvailableSubmitActions,
} from "../content-workflow";

// ─── getSubmitTargetStatus ─────────────────────────────────────────────

describe("getSubmitTargetStatus", () => {
  describe("sendToReview", () => {
    it("HOD invia a REVIEW_HM", () => {
      expect(getSubmitTargetStatus("HOD", "sendToReview", "SOP")).toBe("REVIEW_HM");
    });

    it("HOTEL_MANAGER invia a REVIEW_ADMIN (salta REVIEW_HM)", () => {
      expect(getSubmitTargetStatus("HOTEL_MANAGER", "sendToReview", "SOP")).toBe("REVIEW_ADMIN");
    });

    it("CORPORATE invia a REVIEW_HM", () => {
      expect(getSubmitTargetStatus("CORPORATE", "sendToReview", "SOP")).toBe("REVIEW_HM");
    });

    it("ADMIN invia a REVIEW_HM (consultazione HM)", () => {
      expect(getSubmitTargetStatus("ADMIN", "sendToReview", "SOP")).toBe("REVIEW_HM");
    });

    it("SUPER_ADMIN invia a REVIEW_HM", () => {
      expect(getSubmitTargetStatus("SUPER_ADMIN", "sendToReview", "SOP")).toBe("REVIEW_HM");
    });

    it("OPERATOR non puo inviare", () => {
      expect(() => getSubmitTargetStatus("OPERATOR", "sendToReview", "SOP")).toThrow();
    });
  });

  describe("publishDirectly", () => {
    it("ADMIN pubblica direttamente", () => {
      expect(getSubmitTargetStatus("ADMIN", "publishDirectly", "SOP")).toBe("PUBLISHED");
    });

    it("SUPER_ADMIN pubblica direttamente", () => {
      expect(getSubmitTargetStatus("SUPER_ADMIN", "publishDirectly", "SOP")).toBe("PUBLISHED");
    });

    it("CORPORATE pubblica direttamente", () => {
      expect(getSubmitTargetStatus("CORPORATE", "publishDirectly", "SOP")).toBe("PUBLISHED");
    });

    it("HOD NON puo pubblicare SOP direttamente", () => {
      expect(() => getSubmitTargetStatus("HOD", "publishDirectly", "SOP")).toThrow();
    });

    it("HOD puo pubblicare MEMO direttamente", () => {
      expect(getSubmitTargetStatus("HOD", "publishDirectly", "MEMO")).toBe("PUBLISHED");
    });

    it("HOD puo pubblicare DOCUMENT direttamente", () => {
      expect(getSubmitTargetStatus("HOD", "publishDirectly", "DOCUMENT")).toBe("PUBLISHED");
    });

    it("HM puo pubblicare MEMO direttamente", () => {
      expect(getSubmitTargetStatus("HOTEL_MANAGER", "publishDirectly", "MEMO")).toBe("PUBLISHED");
    });

    it("HM NON puo pubblicare SOP direttamente", () => {
      expect(() => getSubmitTargetStatus("HOTEL_MANAGER", "publishDirectly", "SOP")).toThrow();
    });

    it("OPERATOR non puo pubblicare", () => {
      expect(() => getSubmitTargetStatus("OPERATOR", "publishDirectly", "SOP")).toThrow();
    });
  });
});

// ─── getAvailableSubmitActions ─────────────────────────────────────────

describe("getAvailableSubmitActions", () => {
  it("HOD con SOP: puo inviare a review, NON puo pubblicare", () => {
    const actions = getAvailableSubmitActions("HOD", "SOP");
    expect(actions.canSendToReview).toBe(true);
    expect(actions.canPublishDirectly).toBe(false);
    expect(actions.reviewLabel).toBe("Invia a Hotel Manager");
  });

  it("HOD con MEMO: NON invia a review, puo pubblicare", () => {
    const actions = getAvailableSubmitActions("HOD", "MEMO");
    expect(actions.canSendToReview).toBe(false);
    expect(actions.canPublishDirectly).toBe(true);
  });

  it("HM con SOP senza canPublish: invia a review, NON pubblica", () => {
    const actions = getAvailableSubmitActions("HOTEL_MANAGER", "SOP", false);
    expect(actions.canSendToReview).toBe(true);
    expect(actions.canPublishDirectly).toBe(false);
    expect(actions.reviewLabel).toBe("Invia per approvazione finale");
  });

  it("HM con SOP con canPublish: invia a review E pubblica", () => {
    const actions = getAvailableSubmitActions("HOTEL_MANAGER", "SOP", true);
    expect(actions.canSendToReview).toBe(true);
    expect(actions.canPublishDirectly).toBe(true);
  });

  it("ADMIN: sempre entrambe le opzioni", () => {
    const actions = getAvailableSubmitActions("ADMIN", "SOP");
    expect(actions.canSendToReview).toBe(true);
    expect(actions.canPublishDirectly).toBe(true);
  });

  it("OPERATOR: nessuna azione", () => {
    const actions = getAvailableSubmitActions("OPERATOR", "SOP");
    expect(actions.canSendToReview).toBe(false);
    expect(actions.canPublishDirectly).toBe(false);
  });
});
