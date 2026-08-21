import { describe, it, expect } from "vitest";
import {
  checkPassword,
  isPasswordValid,
  getPasswordError,
  checkPasswordForm,
  passwordSchema,
  PASSWORD_MIN_LENGTH,
} from "../password-policy";

describe("password-policy", () => {
  describe("checkPassword", () => {
    it("riconosce una password conforme", () => {
      expect(checkPassword("password1")).toEqual({
        minLength: true,
        hasLetter: true,
        hasNumber: true,
      });
    });

    it("al confine: 7 caratteri no, 8 sì", () => {
      expect(checkPassword("abcdef1").minLength).toBe(false);
      expect(checkPassword("abcdefg1").minLength).toBe(true);
      expect(PASSWORD_MIN_LENGTH).toBe(8);
    });

    it("solo numeri: manca la lettera", () => {
      const c = checkPassword("12345678");
      expect(c.hasLetter).toBe(false);
      expect(c.hasNumber).toBe(true);
    });

    it("solo lettere: manca il numero", () => {
      const c = checkPassword("abcdefgh");
      expect(c.hasLetter).toBe(true);
      expect(c.hasNumber).toBe(false);
    });

    it("stringa vuota: nessuna condizione soddisfatta", () => {
      expect(checkPassword("")).toEqual({
        minLength: false,
        hasLetter: false,
        hasNumber: false,
      });
    });

    it("accetta lettere accentate e non latine come lettere", () => {
      expect(checkPassword("perché12").hasLetter).toBe(true);
      expect(checkPassword("привет12").hasLetter).toBe(true);
    });

    it("i simboli non contano come lettera né come numero", () => {
      const c = checkPassword("!!!!!!!!");
      expect(c.hasLetter).toBe(false);
      expect(c.hasNumber).toBe(false);
    });

    it("gli spazi contano nella lunghezza e sono ammessi", () => {
      expect(isPasswordValid("ab cd ef1")).toBe(true);
    });
  });

  describe("isPasswordValid", () => {
    it.each([
      ["password1", true],
      ["Password1", true],
      ["abcdefg1", true],
      ["abcdef1", false],
      ["12345678", false],
      ["abcdefgh", false],
      ["", false],
    ])("%s → %s", (password, expected) => {
      expect(isPasswordValid(password)).toBe(expected);
    });
  });

  describe("getPasswordError", () => {
    it("nessun errore se conforme", () => {
      expect(getPasswordError("password1")).toBeNull();
    });

    it("segnala per prima la lunghezza", () => {
      expect(getPasswordError("ab1")).toBe("La password deve avere almeno 8 caratteri.");
    });

    it("segnala la lettera mancante", () => {
      expect(getPasswordError("12345678")).toBe("La password deve contenere almeno una lettera.");
    });

    it("segnala il numero mancante", () => {
      expect(getPasswordError("abcdefgh")).toBe("La password deve contenere almeno un numero.");
    });
  });

  describe("checkPasswordForm", () => {
    it("tutte e tre le spunte verdi abilitano l'invio", () => {
      const r = checkPasswordForm("password1", "password1");
      expect(r.minLength).toBe(true);
      expect(r.hasLetterAndNumber).toBe(true);
      expect(r.matches).toBe(true);
      expect(r.allValid).toBe(true);
    });

    it("password conforme ma conferma diversa: non si invia", () => {
      const r = checkPasswordForm("password1", "password2");
      expect(r.matches).toBe(false);
      expect(r.allValid).toBe(false);
    });

    it("due campi vuoti non 'coincidono'", () => {
      const r = checkPasswordForm("", "");
      expect(r.matches).toBe(false);
      expect(r.allValid).toBe(false);
    });

    it("coincidenti ma non conformi: non si invia", () => {
      const r = checkPasswordForm("abc", "abc");
      expect(r.matches).toBe(true);
      expect(r.allValid).toBe(false);
    });
  });

  describe("passwordSchema (server)", () => {
    it("accetta una password conforme", () => {
      expect(passwordSchema.safeParse("password1").success).toBe(true);
    });

    it("rifiuta con lo stesso messaggio della UI", () => {
      const short = passwordSchema.safeParse("abc1");
      expect(short.success).toBe(false);
      if (!short.success) {
        expect(short.error.issues[0]?.message).toBe("La password deve avere almeno 8 caratteri.");
      }
    });

    it("rifiuta senza numero", () => {
      const r = passwordSchema.safeParse("abcdefgh");
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues[0]?.message).toBe("La password deve contenere almeno un numero.");
      }
    });

    it("client e server danno lo stesso verdetto", () => {
      for (const candidate of ["password1", "abc", "12345678", "abcdefgh", "", "perché12"]) {
        expect(passwordSchema.safeParse(candidate).success).toBe(isPasswordValid(candidate));
      }
    });
  });
});
