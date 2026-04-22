import { describe, it, expect } from "vitest";
import { addMinutes, timeToMinutes, minutesToTime } from "./public.helpers.js";

describe("public.helpers", () => {
  it("addMinutes soma minutos corretamente", () => {
    expect(addMinutes("08:00", 30)).toBe("08:30");
    expect(addMinutes("09:45", 30)).toBe("10:15");
    expect(addMinutes("23:50", 20)).toBe("00:10");
  });

  it("timeToMinutes converte HH:mm em minutos", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("01:30")).toBe(90);
    expect(timeToMinutes("18:00")).toBe(1080);
  });

  it("minutesToTime converte minutos em HH:mm", () => {
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(90)).toBe("01:30");
    expect(minutesToTime(1440)).toBe("00:00");
  });

  it("é simétrico para timeToMinutes/minutesToTime", () => {
    for (const t of ["00:00", "07:15", "12:00", "18:45", "23:59"]) {
      expect(minutesToTime(timeToMinutes(t))).toBe(t);
    }
  });
});
